from typing import Optional, List
from pydantic import BaseModel, Field


class NetQuantity(BaseModel):
    value: str = Field(description="Net quantity magnitude, e.g., '100', '1.5'")
    unit: str = Field(description="Unit of measurement, e.g., 'g', 'ml', 'kg', 'N'")


class MRP(BaseModel):
    value: str = Field(description="Maximum Retail Price amount, e.g., '45.00', 'Rs 120'")
    inclusive_of_taxes_stated: bool = Field(
        default=False,
        description="True if 'inclusive of all taxes' or similar phrasing is explicitly stated"
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
    consumer_care: Optional[str] = Field(
        default=None,
        description="Contact details (name/designation, address, telephone/email) for consumer complaints"
    )
    declarations_present: List[str] = Field(
        default_factory=list,
        description="List of all declaration types identified on the package"
    )


class ScanRequest(BaseModel):
    front_path: str = Field(
        ...,
        description="Path/filename of the front image in Supabase 'evidence-photos' bucket",
        examples=["front.jpeg"]
    )
    back_path: str = Field(
        ...,
        description="Path/filename of the back image in Supabase 'evidence-photos' bucket",
        examples=["back.jpeg"]
    )
    user_id: Optional[str] = Field(
        default=None,
        description="Supabase auth id of the officer who owns this scan",
        examples=["a1b2c3d4-0000-0000-0000-000000000000"]
    )


class Violation(BaseModel):
    field: str
    issue: str
    rule_ref: str


class ScanResponse(BaseModel):
    extracted: ExtractedData
    violations: List[Violation]
    status: Optional[str] = Field(
        default=None,
        description="Overall compliance status (e.g. 'compliant', 'flagged')"
    )
