import json
import logging
from typing import Optional
from google import genai
from google.genai import types
from app.config import Settings, get_settings
from app.schemas.scan import ExtractedData

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are an expert Legal Metrology compliance auditor.
Analyze the provided packaged commodity image/label and extract the required Legal Metrology declarations strictly conforming to the JSON schema.

Extraction Guidelines:
1. `manufacturer_packer_importer`: The full name and complete address of the manufacturer, packer, or importer (e.g. 'Mfd. By: XYZ Ltd...'). Return null if not present.
2. `net_quantity`: The net quantity with numeric/alphanumeric value (e.g., '100', '1.5') and unit (e.g., 'g', 'ml', 'kg', 'N', 'units'). Return null if not present.
3. `mrp`: Maximum Retail Price. `value` is the price amount (e.g., 'Rs 50.00', '50.00'). `inclusive_of_taxes_stated` must be true only if words like 'inclusive of all taxes', 'incl. of all taxes', or 'all taxes included' are explicitly written on the package, false otherwise. Return null if no price is present.
4. `mfg_or_pack_date`: Month and year (or date) of manufacture, packing, or import. Return null if not present.
5. `consumer_care`: Contact details for consumer grievances/care including designation/name, address, telephone number, and/or email. Return null if not present.
6. `declarations_present`: An array of strings identifying every declaration category found on the package (e.g. ['Net Quantity', 'MRP', 'Mfg Date', 'Manufacturer Details', 'Consumer Care Details', 'Ingredients', 'Nutritional Information', 'Batch Number']).
"""


class GeminiService:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.client = genai.Client(api_key=self.settings.GEMINI_API_KEY)
        # Model string is explicitly "gemini-3.5-flash"
        self.model_name = self.settings.GEMINI_MODEL

    def extract_label_data(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> ExtractedData:
        """
        Sends the image to the Gemini API using model string 'gemini-3.5-flash'
        in JSON mode with responseSchema to extract Legal Metrology declarations.

        Args:
            image_bytes: Binary data of the product image.
            mime_type: MIME type of the image (default 'image/jpeg').

        Returns:
            ExtractedData: Strongly typed extracted Legal Metrology data.
        """
        logger.info(f"Sending image ({len(image_bytes)} bytes, {mime_type}) to Gemini model '{self.model_name}'")

        image_part = types.Part.from_bytes(data=image_bytes, mime_type=mime_type)

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExtractedData,
            system_instruction=SYSTEM_PROMPT,
        )

        user_prompt = "Extract all Legal Metrology declarations from this packaged commodity label image."

        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[image_part, user_prompt],
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
