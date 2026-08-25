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

    # 3. Run plain Python hardcoded rule checks (Rule-PLACEHOLDER-1, 2, 3)
    violations, compliance_status = check_compliance_rules(extracted)

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
