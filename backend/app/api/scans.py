import logging
import time
from collections import defaultdict
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from app.schemas.scan import ScanRequest, ScanResponse
from app.services.supabase_service import SupabaseService
from app.services.gemini_service import GeminiService
from app.services.report_service import generate_notice_pdf
from app.rules.engine import check_compliance_rules
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
    summary="Process dual-sided product label scan",
    description=(
        "Fetches FRONT and BACK label photos from Supabase Storage 'evidence-photos', extracts Legal Metrology "
        "declarations in a single call to the configured Gemini model with structured output, applies compliance rules, "
        "persists results into Supabase 'scans' table, and returns extracted data and violations."
    ),
)
@router.post("/", response_model=ScanResponse, include_in_schema=False)
def create_scan(
    payload: ScanRequest,
    current_user: Dict[str, Optional[str]] = Depends(get_current_user),
    supabase_service: SupabaseService = Depends(get_supabase_service),
    gemini_service: GeminiService = Depends(get_gemini_service),
) -> ScanResponse:
    # Owner is derived from the authenticated token, NOT the request body — a
    # client cannot attribute a scan to another user.
    user_id = current_user["id"]
    _enforce_scan_rate_limit(user_id)

    front_path = payload.front_path.strip()
    back_path = payload.back_path.strip()
    category = payload.category.strip() if payload.category else None

    if not front_path or not back_path:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Both 'front_path' and 'back_path' must be provided.",
        )

    logger.info(f"Received dual scan request: front='{front_path}', back='{back_path}'")

    # 1. Fetch BOTH images from Supabase Storage
    try:
        front_bytes = supabase_service.fetch_image(front_path)
    except FileNotFoundError as fnf_err:
        logger.warning(f"Front image not found: {fnf_err}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Front image not found in storage.",
        )
    except Exception as exc:
        logger.error(f"Failed to fetch front image from Supabase storage: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to retrieve the front image from storage.",
        )

    try:
        back_bytes = supabase_service.fetch_image(back_path)
    except FileNotFoundError as fnf_err:
        logger.warning(f"Back image not found: {fnf_err}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Back image not found in storage.",
        )
    except Exception as exc:
        logger.error(f"Failed to fetch back image from Supabase storage: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to retrieve the back image from storage.",
        )

    # 2. Detect mime types and extract declarations via the Gemini API in a SINGLE call
    front_mime = supabase_service.get_mime_type(front_path)
    back_mime = supabase_service.get_mime_type(back_path)

    try:
        extracted = gemini_service.extract_label_data(
            front_image_bytes=front_bytes,
            back_image_bytes=back_bytes,
            front_mime_type=front_mime,
            back_mime_type=back_mime,
        )
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

    # 4. Save record to Supabase 'scans' table
    try:
        extracted_dict = extracted.model_dump()
        violations_dict = [v.model_dump() for v in violations]
        supabase_service.save_scan_record(
            front_path=front_path,
            back_path=back_path,
            extracted=extracted_dict,
            violations=violations_dict,
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

    # 5. Return extracted data and violations
    return ScanResponse(
        extracted=extracted,
        violations=violations,
        status=compliance_status,
    )


def _split_storage_path(scan: dict) -> tuple[str | None, str | None]:
    """Resolve front/back evidence filenames from the scan row.

    Prefers explicit front_path/back_path if present; otherwise splits the
    combined storage_path ("front.jpg | back.jpg").
    """
    front = scan.get("front_path")
    back = scan.get("back_path")
    if front or back:
        return front, back
    storage_path = (scan.get("storage_path") or "").strip()
    if not storage_path:
        return None, None
    parts = [p.strip() for p in storage_path.split("|") if p.strip()]
    front = parts[0] if len(parts) >= 1 else None
    back = parts[1] if len(parts) >= 2 else None
    return front, back


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
    # 1. Fetch the immutable scan record (read-only)
    try:
        scan = supabase_service.fetch_scan(scan_id)
    except Exception as exc:
        logger.error(f"Failed to fetch scan '{scan_id}' for notice: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to fetch the scan record.",
        )

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found.",
        )

    # 1b. Authorisation: only the scan's owner or an admin may download it
    #     (mirrors the RLS scoping, which the service-role backend bypasses).
    if scan.get("user_id") != current_user["id"] and current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorised to access this record.",
        )

    # 2. Officer attribution (name/email) from the profiles table
    profile = None
    try:
        profile = supabase_service.fetch_profile(scan.get("user_id"))
    except Exception as exc:
        logger.warning(f"Could not load officer profile for scan '{scan_id}': {exc}")

    officer_name = (profile or {}).get("full_name") or (profile or {}).get("email") or "Unknown officer"
    officer_email = (profile or {}).get("email")

    # 3. Fetch the two evidence images (best-effort; graceful placeholder if missing)
    front_name, back_name = _split_storage_path(scan)
    front_bytes = back_bytes = None
    front_mime = back_mime = "image/jpeg"
    if front_name:
        try:
            front_bytes = supabase_service.fetch_image(front_name)
            front_mime = supabase_service.get_mime_type(front_name)
        except Exception as exc:
            logger.warning(f"Front evidence image unavailable for scan '{scan_id}': {exc}")
    if back_name:
        try:
            back_bytes = supabase_service.fetch_image(back_name)
            back_mime = supabase_service.get_mime_type(back_name)
        except Exception as exc:
            logger.warning(f"Back evidence image unavailable for scan '{scan_id}': {exc}")

    # 4. Render the notice PDF
    try:
        pdf_bytes = generate_notice_pdf(
            scan=scan,
            officer_name=officer_name,
            officer_email=officer_email,
            front_bytes=front_bytes,
            back_bytes=back_bytes,
            front_mime=front_mime,
            back_mime=back_mime,
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
