import json
import logging
from typing import Optional
from google import genai
from google.genai import types
from app.config import Settings, get_settings
from app.schemas.scan import ExtractedData

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are an expert Legal Metrology compliance auditor.
You are provided with two images representing the FRONT and BACK of the same packaged commodity.
Analyze both images and extract all mandatory Legal Metrology declarations strictly conforming to the JSON schema.
If a declaration appears on either the front or the back image (or across both), combine and extract each field's value from whichever image it appears on.

Extraction Guidelines:
1. `manufacturer_packer_importer`: The full name and complete address of the manufacturer, packer, or importer (e.g. 'Mfd. By: XYZ Ltd...'). Return null if not present.
2. `net_quantity`: The net quantity with numeric/alphanumeric value (e.g., '100', '1.5', '50') and unit (e.g., 'g', 'GM', 'ml', 'kg', 'N', 'units'). Return null if not present.
3. `mrp`: Maximum Retail Price. `value` is the price amount (e.g., 'Rs 50.00', '20.00'). `inclusive_of_taxes_stated` must be true only if words like 'inclusive of all taxes', 'incl. of all taxes', or 'all taxes included' are explicitly written on the package, false otherwise. Return null if no price is present.
4. `mfg_or_pack_date`: Month and year (or date) of manufacture, packing, or import. Return null if not present.
5. `consumer_care`: Contact details for consumer grievances/care including designation/name, address, telephone number, and/or email. Return null if not present.
6. `declarations_present`: An array of strings identifying every declaration category found across both images (e.g. ['manufacturer_packer_importer', 'net_quantity', 'mrp', 'mfg_or_pack_date', 'consumer_care', 'ingredients', 'nutritional_information', 'batch_number']).
"""


class GeminiService:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.client = genai.Client(api_key=self.settings.GEMINI_API_KEY)
        # Model string is explicitly "gemini-3.5-flash"
        self.model_name = self.settings.GEMINI_MODEL

    def extract_label_data(
        self,
        front_image_bytes: bytes,
        back_image_bytes: bytes,
        front_mime_type: str = "image/jpeg",
        back_mime_type: str = "image/jpeg",
    ) -> ExtractedData:
        """
        Sends BOTH front and back images of the product to the Gemini API in a SINGLE call
        using model string 'gemini-3.5-flash' in JSON mode with responseSchema.

        Args:
            front_image_bytes: Binary data of the front product image.
            back_image_bytes: Binary data of the back product image.
            front_mime_type: MIME type of the front image.
            back_mime_type: MIME type of the back image.

        Returns:
            ExtractedData: Strongly typed extracted Legal Metrology data merged across both sides.
        """
        logger.info(
            f"Sending dual images (Front: {len(front_image_bytes)} bytes, Back: {len(back_image_bytes)} bytes) "
            f"to Gemini model '{self.model_name}'"
        )

        front_part = types.Part.from_bytes(data=front_image_bytes, mime_type=front_mime_type)
        back_part = types.Part.from_bytes(data=back_image_bytes, mime_type=back_mime_type)

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExtractedData,
            system_instruction=SYSTEM_PROMPT,
        )

        contents = [
            "Image 1 (Front of product package):",
            front_part,
            "Image 2 (Back of product package):",
            back_part,
            "Extract all Legal Metrology declarations across both images of this product according to the schema.",
        ]

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=contents,
                config=config,
            )

            raw_text = response.text
            if not raw_text:
                logger.warning("Gemini returned empty response text")
                return ExtractedData()

            logger.debug(f"Gemini Raw Response: {raw_text}")
            extracted = ExtractedData.model_validate_json(raw_text)
            return extracted

        except Exception as exc:
            logger.error(f"Error extracting data from Gemini API: {exc}")
            raise RuntimeError(f"Gemini extraction failed: {str(exc)}") from exc
