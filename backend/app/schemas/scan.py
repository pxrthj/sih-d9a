from typing import Optional, List
from pydantic import BaseModel, Field

# A scan accepts between 1 and this many label photographs. Four covers a
# rectangular pack where declarations are spread across every panel, plus the
# common case of a close-up of a small print block.
MAX_LABEL_IMAGES = 4


class NetQuantity(BaseModel):
    value: str = Field(description="Net quantity magnitude, e.g., '100', '1.5'")
    unit: str = Field(description="Unit of measurement, e.g., 'g', 'ml', 'kg', 'N'")


class MRP(BaseModel):
    value: str = Field(description="Maximum Retail Price amount, e.g., '45.00', 'Rs 120'")
    inclusive_of_taxes_stated: bool = Field(
        default=False,
        description="True if 'inclusive of all taxes' or similar phrasing is explicitly stated"
    )


class DeclarationBlock(BaseModel):
    """How the declarations are physically laid out on the package.

    OBSERVATION ONLY. The model reports what it can see; whether that layout is
    acceptable is decided by the rule engine, never here.

    Many packs print MRP, the use-by date and the lot/batch number together in
    one compact box in much smaller type than the surrounding artwork — often
    ink-jet printed after the pack was made. That is what this object captures.
    """
    fields_in_block: List[str] = Field(
        default_factory=list,
        description=(
            "Which declarations share one compact block, e.g. "
            "['mrp', 'use_by_date', 'lot_batch_number']. Empty if there is no such block."
        ),
    )
    stacked_together: bool = Field(
        default=False,
        description="True when two or more declarations share a single compact block or box",
    )
    print_size: Optional[str] = Field(
        default=None,
        description=(
            "Size of that block's text relative to the other printed text on the same panel: "
            "'normal', 'small' or 'very_small'"
        ),
    )
    legible_in_photo: Optional[bool] = Field(
        default=None,
        description="False when the block could not be read with confidence at this resolution",
    )
    location_note: Optional[str] = Field(
        default=None,
        description="Short phrase for where the block sits, e.g. 'bottom of back panel, near the seam'",
    )


class ExtractedData(BaseModel):
    product_name: Optional[str] = Field(
        default=None,
        description="Common or generic name of the commodity (e.g. 'Potato Chips', 'Toothpaste')"
    )
    manufacturer_packer_importer: Optional[str] = Field(
        default=None,
        description="Name and complete address of the manufacturer, packer, or importer"
    )
    net_quantity: Optional[NetQuantity] = Field(
        default=None,
        description="Net quantity and unit of measurement"
    )
    mrp: Optional[MRP] = Field(
        default=None,
        description="MRP details including tax inclusiveness"
    )
    mfg_or_pack_date: Optional[str] = Field(
        default=None,
        description="Date of manufacture, packing, or import (month and year)"
    )
    use_by_date: Optional[str] = Field(
        default=None,
        description="Use-by / best-before / expiry date, as printed. Null if not on the package."
    )
    lot_batch_number: Optional[str] = Field(
        default=None,
        description="Lot, batch or code number, as printed. Null if not on the package."
    )
    consumer_care: Optional[str] = Field(
        default=None,
        description="Contact details (name/designation, address, telephone/email) for consumer complaints"
    )
    declarations_present: List[str] = Field(
        default_factory=list,
        description="List of all declaration types identified on the package"
    )
    declaration_block: Optional[DeclarationBlock] = Field(
        default=None,
        description="Layout of a combined declaration block, when the package has one"
    )


class ScanRequest(BaseModel):
    image_paths: List[str] = Field(
        default_factory=list,
        description=(
            f"1 to {MAX_LABEL_IMAGES} photo paths in the Supabase 'evidence-photos' bucket, "
            "in the order the officer captured them"
        ),
        examples=[["front.jpeg", "back.jpeg"]],
    )
    # Legacy two-image fields, kept so an older frontend build keeps working
    # while a deploy rolls out. `resolved_paths()` prefers image_paths.
    front_path: Optional[str] = Field(default=None, description="Deprecated: use image_paths")
    back_path: Optional[str] = Field(default=None, description="Deprecated: use image_paths")
    user_id: Optional[str] = Field(
        default=None,
        description="Supabase auth id of the officer who owns this scan",
        examples=["a1b2c3d4-0000-0000-0000-000000000000"]
    )
    category: Optional[str] = Field(
        default=None,
        description="Product category selected by the officer (e.g. 'General', 'Food & Beverages')",
        examples=["General"]
    )

    def resolved_paths(self) -> List[str]:
        """The photo paths for this request, trimmed and de-blanked.

        Prefers `image_paths`; falls back to the legacy front/back fields.
        """
        paths = [p.strip() for p in (self.image_paths or []) if p and p.strip()]
        if paths:
            return paths
        legacy = [self.front_path, self.back_path]
        return [p.strip() for p in legacy if p and p.strip()]


class Violation(BaseModel):
    """A failed Legal Metrology rule. Deterministic, and always cites a rule."""
    field: str
    issue: str
    rule_ref: str


class Advisory(BaseModel):
    """Something for the officer to check by hand — NOT a rule failure.

    Advisories never change the compliance status. They exist for findings we
    can observe but cannot adjudicate from a photograph, such as declarations
    printed too small to measure.
    """
    field: str
    issue: str
    rule_ref: str


class ScanResponse(BaseModel):
    extracted: ExtractedData
    violations: List[Violation]
    advisories: List[Advisory] = Field(
        default_factory=list,
        description="Non-binding observations for the officer; do not affect status",
    )
    status: Optional[str] = Field(
        default=None,
        description="Overall compliance status (e.g. 'compliant', 'flagged')"
    )
