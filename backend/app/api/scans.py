import logging
import time
from collections import defaultdict
from functools import lru_cache
from typing import Dict, List, Optional, Tuple
from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from app.schemas.scan import (
    MAX_LABEL_IMAGES,
    ExtractedData,
    ExtractionSeal,
    ExtractRequest,
    ExtractResponse,
    ScanRequest,
    ScanResponse,
)
from app.services.extraction_seal import seal_extraction, verify_extraction
from app.services.supabase_service import SupabaseService
from app.services.gemini_service import GeminiService
from app.services.report_service import _fmt_dt, _notice_ref, generate_notice_pdf, notice_filename
from app.rules.engine import build_advisories, check_compliance_rules
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scans", tags=["scans"])


# One Supabase client and one Gemini client per process, built lazily on first
# use. Constructing them per request rebuilt an httpx connection pool every time;
# reusing a single client is both faster and how these SDKs are meant to be held.
# The dependency wrappers stay as functions so tests can still override them.
@lru_cache(maxsize=1)
def _shared_supabase_service() -> SupabaseService:
    return SupabaseService(settings=get_settings())


@lru_cache(maxsize=1)
def _shared_gemini_service() -> GeminiService:
    return GeminiService(settings=get_settings())


def get_supabase_service() -> SupabaseService:
    return _shared_supabase_service()


def get_gemini_service() -> GeminiService:
    return _shared_gemini_service()


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

# The verification route is public, so it is limited per client address rather
# than per user. Generous, because a single notice may be checked by several
# people, but enough to stop anyone enumerating.
_VERIFY_CALLS: Dict[str, List[float]] = defaultdict(list)
_VERIFY_LIMIT_MAX = 60
_VERIFY_LIMIT_WINDOW = 60.0


def _rate_limit_hit(
    store: Dict[str, List[float]], key: str, max_calls: int, window: float
) -> bool:
    """Sliding-window check shared by both limiters. Returns True when `key` is
    over the limit; otherwise records this call and returns False.

    Also evicts keys whose most recent call has aged out, so the store cannot
    grow without bound one entry per user/IP forever. Checking only the last
    (newest) timestamp keeps that eviction O(1) per key.
    """
    now = time.time()
    cutoff = now - window
    for idle in [k for k, ts in store.items() if not ts or ts[-1] <= cutoff]:
        del store[idle]
    calls = store[key]
    calls[:] = [t for t in calls if t > cutoff]
    if len(calls) >= max_calls:
        return True
    calls.append(now)
    return False


def _enforce_verify_rate_limit(client_ip: str) -> None:
    if _rate_limit_hit(_VERIFY_CALLS, client_ip, _VERIFY_LIMIT_MAX, _VERIFY_LIMIT_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests. Please wait a moment.",
        )


def _enforce_scan_rate_limit(user_id: str) -> None:
    if _rate_limit_hit(_SCAN_CALLS, user_id, _RATE_LIMIT_MAX, _RATE_LIMIT_WINDOW):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many scans in a short time. Please wait a moment and try again.",
        )


def _load_images(
    image_paths: List[str], supabase_service: SupabaseService
) -> List[Tuple[bytes, str]]:
    """Fetch every evidence photo from storage, in the order it was captured."""
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
    return images


def _validate_paths(image_paths: List[str]) -> None:
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


def _corrected_fields(original: ExtractedData, reviewed: ExtractedData) -> List[str]:
    """Which declarations the officer changed, comparing field by field.

    Top-level fields only, which is the granularity an officer edits and the
    granularity the notice reports. Sorted so the record reads the same way
    every time it is regenerated.
    """
    before = original.model_dump()
    after = reviewed.model_dump()
    return sorted(key for key in after if before.get(key) != after.get(key))


@router.post(
    "/extract",
    response_model=ExtractResponse,
    status_code=status.HTTP_200_OK,
    summary="Read a package and check it, without writing anything down",
    description=(
        "Runs extraction and the compliance rules over 1 to 4 label photos and returns the "
        "result for the officer to review. Nothing is persisted. The response carries a seal "
        "over the model's reading; POST /api/scans requires it back, which is what lets a "
        "saved record prove which declarations the officer corrected."
    ),
)
def extract_scan(
    payload: ExtractRequest,
    current_user: Dict[str, Optional[str]] = Depends(get_current_user),
    supabase_service: SupabaseService = Depends(get_supabase_service),
    gemini_service: GeminiService = Depends(get_gemini_service),
    settings: Settings = Depends(get_settings),
) -> ExtractResponse:
    user_id = current_user["id"]
    _enforce_scan_rate_limit(user_id)

    image_paths = [p.strip() for p in (payload.image_paths or []) if p and p.strip()]
    _validate_paths(image_paths)

    logger.info(f"Extraction request with {len(image_paths)} image(s): {image_paths}")
    images = _load_images(image_paths, supabase_service)

    try:
        extracted = gemini_service.extract_label_data(images=images)
    except Exception as exc:
        logger.error(f"Gemini API extraction failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Label extraction is temporarily unavailable. Please try again.",
        )

    category = payload.category.strip() if payload.category else None
    violations, compliance_status = check_compliance_rules(extracted, category=category)
    advisories = build_advisories(extracted, image_count=len(images))

    return ExtractResponse(
        extracted=extracted,
        violations=violations,
        advisories=advisories,
        status=compliance_status,
        seal=ExtractionSeal(
            **seal_extraction(extracted.model_dump(), settings.SUPABASE_SERVICE_ROLE_KEY)
        ),
    )


@router.post(
    "",
    response_model=ScanResponse,
    status_code=status.HTTP_200_OK,
    summary="Save an inspection record",
    description=(
        "Writes one permanent record. Given a reviewed extraction (from POST /api/scans/extract) "
        "it verifies the seal on the model's original reading, re-runs the compliance rules over "
        "what the officer confirmed, and stores both readings plus the list of corrected fields. "
        "Given no extraction it performs the original one-shot scan instead, so an older frontend "
        "keeps working during a deploy."
    ),
)
@router.post("/", response_model=ScanResponse, include_in_schema=False)
def create_scan(
    payload: ScanRequest,
    current_user: Dict[str, Optional[str]] = Depends(get_current_user),
    supabase_service: SupabaseService = Depends(get_supabase_service),
    gemini_service: GeminiService = Depends(get_gemini_service),
    settings: Settings = Depends(get_settings),
) -> ScanResponse:
    # Owner is derived from the authenticated token, NOT the request body -- a
    # client cannot attribute a scan to another user.
    user_id = current_user["id"]
    _enforce_scan_rate_limit(user_id)

    image_paths = payload.resolved_paths()
    category = payload.category.strip() if payload.category else None
    _validate_paths(image_paths)

    if payload.is_reviewed():
        # --- Commit of a reviewed extraction -------------------------------
        # The officer may have corrected what the model read. Two things keep
        # that honest: the original reading has to carry this server's seal, so
        # it cannot be invented to hide an edit; and the verdict below is
        # recomputed here rather than accepted from the client.
        if payload.extracted_original is None or payload.seal is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A reviewed scan must include the original extraction and its seal.",
            )

        ok, reason = verify_extraction(
            payload.extracted_original.model_dump(),
            payload.seal.model_dump(),
            settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        if not ok:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=reason)

        extracted = payload.extracted
        original = payload.extracted_original
        corrected = _corrected_fields(original, extracted)
        image_count = len(image_paths)
        if corrected:
            logger.info(f"Officer corrected {len(corrected)} field(s): {', '.join(corrected)}")
    else:
        # --- Legacy one-shot scan ------------------------------------------
        logger.info(f"One-shot scan request with {len(image_paths)} image(s): {image_paths}")
        images = _load_images(image_paths, supabase_service)
        try:
            extracted = gemini_service.extract_label_data(images=images)
        except Exception as exc:
            logger.error(f"Gemini API extraction failed: {exc}")
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Label extraction is temporarily unavailable. Please try again.",
            )
        original = extracted
        corrected = []
        image_count = len(images)

    # The deterministic Legal Metrology checks, over whatever is about to be
    # written down. Category is passed through so future per-category rules can
    # hook in; today every category runs the exact same 8 checks.
    violations, compliance_status = check_compliance_rules(extracted, category=category)
    advisories = build_advisories(extracted, image_count=image_count)

    try:
        saved = supabase_service.save_scan_record(
            image_paths=image_paths,
            extracted=extracted.model_dump(),
            violations=[v.model_dump() for v in violations],
            advisories=[a.model_dump() for a in advisories],
            status=compliance_status,
            user_id=user_id,
            category=category,
            # Capture location is self-reported by the officer's device (unlike
            # ownership, which comes from the token) and is stored as evidence of
            # where the inspection took place; it appears on the notice.
            latitude=payload.latitude,
            longitude=payload.longitude,
            location_accuracy=payload.location_accuracy,
            # What the model read, kept alongside what was confirmed. Without
            # both, a corrected record can no longer show what the photograph
            # actually said, which is most of its value as evidence.
            extracted_original=original.model_dump(),
            corrected_fields=corrected,
        )
    except Exception as exc:
        logger.error(f"Failed to write record to Supabase 'scans' table: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save the inspection record.",
        )

    return ScanResponse(
        extracted=extracted,
        violations=violations,
        advisories=advisories,
        status=compliance_status,
        id=str(saved.get("id")) if isinstance(saved, dict) and saved.get("id") else None,
        corrected_fields=corrected,
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
    "/{scan_id}/verify",
    summary="Public verification of an issued Improvement Notice",
    description=(
        "Returns the authoritative verdict for a scan so that anyone holding a printed "
        "notice can check it against the record. Deliberately PUBLIC and deliberately "
        "minimal: the scan id printed on the notice is the credential, and only what is "
        "already printed on that notice is returned — never the evidence photographs, "
        "the officer's email, or any other record."
    ),
)
def verify_scan(
    scan_id: str,
    request: Request,
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> Dict[str, object]:
    _enforce_verify_rate_limit(request.client.host if request.client else "unknown")

    try:
        scan = supabase_service.fetch_scan(scan_id)
    except Exception as exc:
        logger.error(f"Verification lookup failed for '{scan_id}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach the inspection record.",
        )

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No inspection record matches this reference.",
        )

    profile = None
    try:
        profile = supabase_service.fetch_profile(scan.get("user_id"))
    except Exception as exc:
        logger.warning(f"Officer name unavailable for verification of '{scan_id}': {exc}")

    extracted = scan.get("extracted") or {}
    return {
        "notice_ref": _notice_ref(scan),
        "status": scan.get("status"),
        "inspection_date": _fmt_dt(scan.get("created_at"), with_time=True),
        "officer_name": (profile or {}).get("full_name") or "Unknown officer",
        "category": scan.get("category") or "General",
        "product_name": extracted.get("product_name"),
        "manufacturer": extracted.get("manufacturer_packer_importer"),
        "violations": [
            {"field": v.get("field"), "issue": v.get("issue"), "rule_ref": v.get("rule_ref")}
            for v in (scan.get("violations") or [])
        ],
        "advisories": [
            {"field": a.get("field"), "issue": a.get("issue"), "rule_ref": a.get("rule_ref")}
            for a in (scan.get("advisories") or [])
        ],
    }


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
    settings: Settings = Depends(get_settings),
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
            verify_url=f"{settings.APP_BASE_URL}/verify/{scan_id}",
        )
    except Exception as exc:
        logger.error(f"Failed to generate notice PDF for scan '{scan_id}': {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate the improvement notice.",
        )

    filename = notice_filename(scan)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
