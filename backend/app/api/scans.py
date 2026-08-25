import logging
from fastapi import APIRouter, Depends, HTTPException, status
from app.schemas.scan import ScanRequest, ScanResponse
from app.services.supabase_service import SupabaseService
from app.services.gemini_service import GeminiService
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
    summary="Process product label scan",
    description=(
        "Fetches label photo from Supabase Storage 'evidence-photos', extracts Legal Metrology declarations "
        "using Gemini 3.5 Flash with structured output, applies compliance rules, persists results in Supabase "
        "'scans' table, and returns extracted data and violations."
    ),
)
@router.post("/", response_model=ScanResponse, include_in_schema=False)
def create_scan(
    payload: ScanRequest,
    supabase_service: SupabaseService = Depends(get_supabase_service),
    gemini_service: GeminiService = Depends(get_gemini_service),
) -> ScanResponse:
    storage_path = payload.storage_path.strip()
    if not storage_path:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="storage_path cannot be empty.",
        )

    logger.info(f"Received scan request for storage_path: '{storage_path}'")

    # 1. Fetch image from Supabase Storage
    try:
        image_bytes = supabase_service.fetch_image(storage_path)
    except FileNotFoundError as fnf_err:
        logger.warning(f"File not found in storage: {fnf_err}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(fnf_err),
        )
    except Exception as exc:
        logger.error(f"Failed to fetch image from Supabase storage: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to retrieve image from storage: {str(exc)}",
        )

    # 2. Detect mime type and extract declarations via Gemini API (gemini-3.5-flash)
    mime_type = supabase_service.get_mime_type(storage_path)
    try:
        extracted = gemini_service.extract_label_data(image_bytes=image_bytes, mime_type=mime_type)
    except Exception as exc:
        logger.error(f"Gemini API extraction failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Gemini extraction failed: {str(exc)}",
        )

    # 3. Run plain Python hardcoded rule checks (Rule-PLACEHOLDER-1, 2, 3)
    violations, compliance_status = check_compliance_rules(extracted)

    # 4. Save record to Supabase 'scans' table
    try:
        extracted_dict = extracted.model_dump()
        violations_dict = [v.model_dump() for v in violations]
        supabase_service.save_scan_record(
            storage_path=storage_path,
            extracted=extracted_dict,
            violations=violations_dict,
            status=compliance_status,
        )
    except Exception as exc:
        logger.error(f"Failed to write record to Supabase 'scans' table: {exc}")
        # Note: If database write fails, we log and return HTTP 500 error
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
