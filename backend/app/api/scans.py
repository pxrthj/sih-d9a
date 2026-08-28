import logging
import time
from collections import defaultdict
from typing import Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from app.schemas.scan import MAX_LABEL_IMAGES, ScanRequest, ScanResponse
from app.services.supabase_service import SupabaseService
from app.services.gemini_service import GeminiService
from app.services.report_service import generate_notice_pdf
from app.rules.engine import build_advisories, check_compliance_rules
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scans", tags=["scans"])


def get_supabase_service(settings: Settings = Depends(get_settings)) -> SupabaseService:
    return SupabaseService(settings=settings)


def get_gemini_service(settings: Settings = Depends(get_settings)) -> GeminiService:
    return GeminiService(settings=settings)


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> Dict[str, Optional[str]]:
    """
    Authenticate the caller from the `Authorization: Bearer <token>` header,
    validating the Supabase access token and confirming the user has an active,
    authorised profile (officer or admin). Returns {id, email, role}.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )
    token = authorization[7:].strip()
    user = supabase_service.get_user_from_token(token)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please sign in again.",
        )

    profile = supabase_service.fetch_profile(user["id"])
    if (
        not profile
        or profile.get("status") != "active"
        or profile.get("role") not in ("officer", "admin")
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not authorised.",
        )
    return {"id": user["id"], "email": user.get("email"), "role": profile.get("role")}


# --- Lightweight per-user rate limit on the (Gemini-billed) scan endpoint ---
_SCAN_CALLS: Dict[str, List[float]] = defaultdict(list)
_RATE_LIMIT_MAX = 20        # scans
_RATE_LIMIT_WINDOW = 60.0   # per this many seconds, per user

# How long an evidence-photo signed URL stays valid (seconds).
_EVIDENCE_URL_TTL = 3600


def _enforce_scan_rate_limit(user_id: str) -> None:
    now = time.time()
    cutoff = now - _RATE_LIMIT_WINDOW
    calls = _SCAN_CALLS[user_id]
    calls[:] = [t for t in calls if t > cutoff]
    if len(calls) >= _RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many scans in a short time. Please wait a moment and try again.",
        )
    calls.append(now)


@router.post(
    "",
    response_model=ScanResponse,
    status_code=status.HTTP_200_OK,
    summary="Process a multi-photo product label scan",
    description=(
        f"Fetches 1 to {MAX_LABEL_IMAGES} label photos from Supabase Storage 'evidence-photos', extracts "
        "Legal Metrology declarations from all of them in a single call to the configured Gemini model "
        "with structured output, applies the compliance rules, persists the result into the Supabase "
        "'scans' table, and returns the extracted data, violations and advisories."
    ),
)
@router.post("/", response_model=ScanResponse, include_in_schema=False)
def create_scan(
    payload: ScanRequest,
    current_user: Dict[str, Optional[str]] = Depends(get_current_user),
    supabase_service: SupabaseService = Depends(get_supabase_service),
    gemini_service: GeminiService = Depends(get_gemini_service),
) -> ScanResponse:
    # Owner is derived from the authenticated token, NOT the request body -- a
    # client cannot attribute a scan to another user.
    user_id = current_user["id"]
    _enforce_scan_rate_limit(user_id)

    image_paths = payload.resolved_paths()
    category = payload.category.strip() if payload.category else None

    if not image_paths:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="At least one label photo is required.",
        )
    if len(image_paths) > MAX_LABEL_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"At most {MAX_LABEL_IMAGES} label photos can be scanned at once.",
        )

    logger.info(f"Received scan request with {len(image_paths)} image(s): {image_paths}")

    # 1. Fetch every image from Supabase Storage, in the order captured.
    images: List[Tuple[bytes, str]] = []
    for index, path in enumerate(image_paths, start=1):
        try:
            image_bytes = supabase_service.fetch_image(path)
        except FileNotFoundError as fnf_err:
            logger.warning(f"Image {index} not found: {fnf_err}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Photo {index} was not found in storage.",
            )
        except Exception as exc:
            logger.error(f"Failed to fetch image {index} from Supabase storage: {exc}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to retrieve photo {index} from storage.",
            )
        images.append((image_bytes, supabase_service.get_mime_type(path)))

    # 2. Extract declarations from every image via the Gemini API in a SINGLE call
    try:
        extracted = gemini_service.extract_label_data(images=images)
    except Exception as exc:
        logger.error(f"Gemini API extraction failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Label extraction is temporarily unavailable. Please try again.",
        )

    # 3. Run the deterministic Legal Metrology Rule 6 checks. Category is passed
    #    through so future per-category rules can hook in; today every category
    #    runs the exact same 8 checks.
    violations, compliance_status = check_compliance_rules(extracted, category=category)

    # 3b. Advisories are observations only -- they never change the status.
    advisories = build_advisories(extracted, image_count=len(images))

    # 4. Save record to Supabase 'scans' table
    try:
        supabase_service.save_scan_record(
            image_paths=image_paths,
            extracted=extracted.model_dump(),
            violations=[v.model_dump() for v in violations],
            advisories=[a.model_dump() for a in advisories],
            status=compliance_status,
            user_id=user_id,
            category=category,
        )
    except Exception as exc:
        logger.error(f"Failed to write record to Supabase 'scans' table: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save the inspection record.",
        )

    # 5. Return extracted data, violations and advisories
    return ScanResponse(
        extracted=extracted,
        violations=violations,
        advisories=advisories,
        status=compliance_status,
    )


def _image_paths(scan: dict) -> List[str]:
    """Resolve the ordered evidence filenames for a scan row.

    `storage_path` is the canonical store: a pipe-joined list of 1 to
    MAX_LABEL_IMAGES filenames ("front.jpg | back.jpg | side.jpg"). The legacy
    front_path/back_path columns are read only when it is empty.
    """
    storage_path = (scan.get("storage_path") or "").strip()
    if storage_path:
        return [p.strip() for p in storage_path.split("|") if p.strip()]
    legacy = [scan.get("front_path"), scan.get("back_path")]
    return [p.strip() for p in legacy if p and p.strip()]


def _authorise_scan_access(
    scan_id: str,
    current_user: Dict[str, Optional[str]],
    supabase_service: SupabaseService,
) -> dict:
    """Load a scan and confirm the caller may see it (owner, or any admin).

    Mirrors the RLS scoping on the `scans` table, which the service-role
    backend bypasses. Raises the appropriate HTTPException otherwise.
    """
    try:
        scan = supabase_service.fetch_scan(scan_id)
    except Exception as exc:
        logger.error(f"Failed to fetch scan '{scan_id}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch the scan record.",
        )

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found.",
        )

    if scan.get("user_id") != current_user["id"] and current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorised to access this record.",
        )
    return scan


@router.get(
    "/{scan_id}/evidence",
    summary="Short-lived signed URLs for a scan's evidence photos",
    description=(
        "Returns time-limited signed URLs for every evidence photo of an existing scan, in "
        "capture order. The bucket is private and the URLs are minted server-side with the "
        "service-role key, so this works without any storage read policy; access is "
        "authorised the same way as the notice (owner, or an admin). Read-only."
    ),
)
def get_scan_evidence(
    scan_id: str,
    current_user: Dict[str, Optional[str]] = Depends(get_current_user),
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> Dict[str, object]:
    scan = _authorise_scan_access(scan_id, current_user, supabase_service)
    images = [
        {"path": path, "url": supabase_service.create_signed_url(path, _EVIDENCE_URL_TTL)}
        for path in _image_paths(scan)
    ]
    return {"images": images}


@router.get(
    "/{scan_id}/notice",
    summary="Download a Legal Metrology Improvement Notice PDF for a scan",
    description=(
        "Generates a formal, printable A4 Improvement Notice PDF from an existing "
        "(immutable) scan record. Read-only: the scan is never modified."
    ),
)
def download_improvement_notice(
    scan_id: str,
    current_user: Dict[str, Optional[str]] = Depends(get_current_user),
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> Response:
    # 1. Fetch the immutable scan record (read-only) and authorise the caller:
    #    only the scan's owner or an admin may download it.
    scan = _authorise_scan_access(scan_id, current_user, supabase_service)

    # 2. Officer attribution (name/email) from the profiles table
    profile = None
    try:
        profile = supabase_service.fetch_profile(scan.get("user_id"))
    except Exception as exc:
        logger.warning(f"Could not load officer profile for scan '{scan_id}': {exc}")

    officer_name = (profile or {}).get("full_name") or (profile or {}).get("email") or "Unknown officer"
    officer_email = (profile or {}).get("email")

    # 3. Fetch every evidence image (best-effort; the notice still renders without them)
    evidence: List[Tuple[bytes, str]] = []
    for path in _image_paths(scan):
        try:
            evidence.append(
                (supabase_service.fetch_image(path), supabase_service.get_mime_type(path))
            )
        except Exception as exc:
            logger.warning(f"Evidence image '{path}' unavailable for scan '{scan_id}': {exc}")

    # 4. Render the notice PDF
    try:
        pdf_bytes = generate_notice_pdf(
            scan=scan,
            officer_name=officer_name,
            officer_email=officer_email,
            evidence=evidence,
        )
    except Exception as exc:
        logger.error(f"Failed to generate notice PDF for scan '{scan_id}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate the improvement notice.",
        )

    filename = f"improvement-notice-{str(scan_id)[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
