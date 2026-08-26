import logging
from fastapi import APIRouter, Depends, HTTPException, Response, status
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


@router.post(
    "",
    response_model=ScanResponse,
    status_code=status.HTTP_200_OK,
    summary="Process dual-sided product label scan",
    description=(
        "Fetches FRONT and BACK label photos from Supabase Storage 'evidence-photos', extracts Legal Metrology "
        "declarations in a single call using Gemini 3.5 Flash with structured output, applies compliance rules, "
        "persists results into Supabase 'scans' table, and returns extracted data and violations."
    ),
)
@router.post("/", response_model=ScanResponse, include_in_schema=False)
def create_scan(
    payload: ScanRequest,
    supabase_service: SupabaseService = Depends(get_supabase_service),
    gemini_service: GeminiService = Depends(get_gemini_service),
) -> ScanResponse:
    front_path = payload.front_path.strip()
    back_path = payload.back_path.strip()
    user_id = payload.user_id.strip() if payload.user_id else None
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
            detail=f"Front image not found: {str(fnf_err)}",
        )
    except Exception as exc:
        logger.error(f"Failed to fetch front image from Supabase storage: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to retrieve front image from storage: {str(exc)}",
        )

    try:
        back_bytes = supabase_service.fetch_image(back_path)
    except FileNotFoundError as fnf_err:
        logger.warning(f"Back image not found: {fnf_err}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Back image not found: {str(fnf_err)}",
        )
    except Exception as exc:
        logger.error(f"Failed to fetch back image from Supabase storage: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to retrieve back image from storage: {str(exc)}",
        )

    # 2. Detect mime types and extract declarations via Gemini API (gemini-3.5-flash) in a SINGLE call
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
            detail=f"Gemini extraction failed: {str(exc)}",
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
            detail=f"Failed to persist scan record: {str(exc)}",
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
    supabase_service: SupabaseService = Depends(get_supabase_service),
) -> Response:
    # 1. Fetch the immutable scan record (read-only)
    try:
        scan = supabase_service.fetch_scan(scan_id)
    except Exception as exc:
        logger.error(f"Failed to fetch scan '{scan_id}' for notice: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch scan record: {str(exc)}",
        )

    if not scan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Scan '{scan_id}' not found.",
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
            detail=f"Failed to generate improvement notice: {str(exc)}",
        )

    filename = f"improvement-notice-{str(scan_id)[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
