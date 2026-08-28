import logging
from typing import List, Optional, Sequence, Tuple
from google import genai
from google.genai import types
from app.config import Settings, get_settings
from app.schemas.scan import ExtractedData

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You are an expert Legal Metrology compliance auditor.
You are given between one and four photographs of the SAME packaged commodity — different panels
(front, back, sides, base) and sometimes a close-up of one region. Examine EVERY image.
Extract all mandatory Legal Metrology declarations strictly conforming to the JSON schema.
A declaration may appear on any image, or be split across images: combine them and take each
field's value from whichever image shows it most clearly.

Extraction Guidelines:
1. `product_name`: The common or generic name of the commodity — its category descriptor, NOT the brand name (e.g. 'Potato Chips', 'Namkeen', 'Toothpaste', 'Biscuits'). Return null if not present.
2. `manufacturer_packer_importer`: The full name and complete address of the manufacturer, packer, or importer (e.g. 'Mfd. By: XYZ Ltd...'). Return null if not present.
3. `net_quantity`: The net quantity with numeric/alphanumeric value (e.g., '100', '1.5', '50') and unit (e.g., 'g', 'GM', 'ml', 'kg', 'N', 'units'). Return null if not present.
4. `mrp`: Maximum Retail Price. `value` is the price amount (e.g., 'Rs 50.00', '20.00'). `inclusive_of_taxes_stated` must be true only if words like 'inclusive of all taxes', 'incl. of all taxes', or 'all taxes included' are explicitly written on the package, false otherwise. Return null if no price is present.
5. `mfg_or_pack_date`: Month and year (or date) of manufacture, packing, or import. Return null if not present.
6. `use_by_date`: The use-by, best-before or expiry date exactly as printed (e.g. 'Best Before 9 months from Mfg', '12/2026'). Return null if not present.
7. `lot_batch_number`: The lot, batch or code number exactly as printed (e.g. 'LOT B23', 'Batch No. 4471'). Return null if not present.
8. `consumer_care`: Contact details for consumer grievances/care including designation/name, address, telephone number, and/or email. Return null if not present.
9. `declarations_present`: An array of strings identifying every declaration category found across all images (e.g. ['product_name', 'manufacturer_packer_importer', 'net_quantity', 'mrp', 'mfg_or_pack_date', 'use_by_date', 'lot_batch_number', 'consumer_care', 'ingredients', 'nutritional_information']).

THE COMBINED DECLARATION BLOCK — read this part with particular care.
Many Indian packs do NOT print the MRP, the use-by date and the lot/batch number in the main
artwork. Instead they are squeezed together into ONE small box or a few stacked lines, in type
noticeably smaller than everything around it, and frequently ink-jet printed, laser-coded or
embossed onto the pack after it was made rather than being part of the printed design. It is
often near a seam, a flap, the base of the pack, or beside the barcode.

Actively hunt for such a block in every image, including low-contrast, dot-matrix and embossed
text. Zoom your attention into it and transcribe it as accurately as you can — then use it to
fill `mrp`, `use_by_date`, `lot_batch_number` and `mfg_or_pack_date` as applicable, exactly as
you would if they were printed normally.

Then describe the block itself in `declaration_block`:
  - `fields_in_block`: which declarations share that one block, using the schema's field names
    (e.g. ['mrp', 'use_by_date', 'lot_batch_number']).
  - `stacked_together`: true when two or more declarations share a single compact block or box
    instead of being declared separately in the artwork.
  - `print_size`: 'normal', 'small' or 'very_small', judged RELATIVE to the other printed text
    on the same panel.
  - `legible_in_photo`: false if you could not read the block with confidence at this resolution.
  - `location_note`: a short phrase for where it sits, e.g. 'bottom of back panel, near the seam'.
If the package has no such combined block, set `stacked_together` to false, leave
`fields_in_block` empty, and leave the remaining sub-fields null.

ACCURACY RULES:
- Never guess or infer a value that you cannot actually read. If text is too small, blurred or
  cut off, leave that field null and set `declaration_block.legible_in_photo` to false.
- Do not carry a value over from packaging conventions or from a similar product you know of.
  Report only what is visible in these photographs.
"""


class GeminiService:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.client = genai.Client(api_key=self.settings.GEMINI_API_KEY)
        # Whatever GEMINI_MODEL is set to (default: gemini-3.5-flash).
        self.model_name = self.settings.GEMINI_MODEL

    def extract_label_data(
        self,
        images: Sequence[Tuple[bytes, str]],
    ) -> ExtractedData:
        """
        Send every supplied label photograph to Gemini in a SINGLE call, using the
        configured model in JSON mode with responseSchema.

        Args:
            images: ordered (image_bytes, mime_type) pairs — 1 to 4 photographs of
                the same package.

        Returns:
            ExtractedData: strongly typed Legal Metrology data merged across all images.
        """
        if not images:
            raise ValueError("At least one label image is required for extraction.")

        sizes = ", ".join(f"{len(b)} bytes" for b, _ in images)
        logger.info(
            f"Sending {len(images)} image(s) ({sizes}) to Gemini model '{self.model_name}'"
        )

        config = types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=ExtractedData,
            system_instruction=SYSTEM_PROMPT,
            # Spend more image tokens per photo. Small ink-jet MRP/batch blocks are
            # exactly what the default resolution loses.
            media_resolution=types.MediaResolution.MEDIA_RESOLUTION_HIGH,
        )

        contents: List[object] = []
        total = len(images)
        for index, (image_bytes, mime_type) in enumerate(images, start=1):
            contents.append(f"Image {index} of {total} (a panel of the same package):")
            contents.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
        contents.append(
            "Extract all Legal Metrology declarations visible across these images of this "
            "single product, including any small combined MRP / use-by / lot block, according "
            "to the schema."
        )

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
