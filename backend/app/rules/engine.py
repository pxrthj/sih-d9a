"""
Legal Metrology (Packaged Commodities) Rules, 2011 — compliance checks.

These are DETERMINISTIC Python checks over the already-extracted JSON. No AI is
involved here. A rule "fails" (produces a violation) when its `check` returns
False; a passing rule produces nothing.

The output shape is unchanged: a list of Violation{ field, issue, rule_ref } and
an overall status ("compliant" when there are no violations, else "flagged").

HOW TO EDIT (for non-programmers / the legal team):
  - The 8 rules live in the RULES list at the bottom. Each entry has a plain-
    English `issue`, its `rule_ref`, and a small `check` function.
  - To change wording, edit the `issue` / `rule_ref` strings.
  - To change what counts as a valid unit, edit STANDARD_UNITS / UNIT_ALIASES /
    NON_STANDARD_UNITS below.
  - To add/remove a rule, add/remove an entry in RULES.
"""

from typing import Callable, List, Tuple
from app.schemas.scan import ExtractedData, Violation


# ---------------------------------------------------------------------------
# Editable unit vocabularies (Rule 6(1)(c) and Rule 13(4))
# ---------------------------------------------------------------------------

# Canonical standard metric units accepted for net quantity.
# (g, kg, mg, ml, l, cm, m) plus a plain count/number ("n" / "u").
STANDARD_UNITS = {"g", "kg", "mg", "ml", "l", "cm", "m", "n", "u"}

# Common spellings the extractor may return, normalised to a canonical unit above.
# Add more spellings here if the extractor returns them.
UNIT_ALIASES = {
    "gm": "g", "gms": "g", "gram": "g", "grams": "g",
    "kgs": "kg", "kilogram": "kg", "kilograms": "kg",
    "mgs": "mg",
    "mls": "ml", "milliliter": "ml", "millilitre": "ml",
    "ltr": "l", "ltrs": "l", "litre": "l", "liter": "l", "litres": "l", "liters": "l",
    "nos": "n", "no": "n", "unit": "u", "units": "u", "count": "u",
}

# Explicitly prohibited (non-standard) units under Rule 13(4).
NON_STANDARD_UNITS = {
    "dozen", "dozens", "doz",
    "score", "scores",
    "gross", "grosses",
    "piece", "pieces", "pcs", "pc",
}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _text(value) -> bool:
    """True when a value is a non-empty, non-whitespace string."""
    return isinstance(value, str) and value.strip() != ""


def _canonical_unit(unit: str) -> str:
    """Lowercase, trim, drop a trailing period, and apply spelling aliases."""
    u = (unit or "").strip().lower().rstrip(".")
    return UNIT_ALIASES.get(u, u)


# ---------------------------------------------------------------------------
# Rule check functions — each returns True when the rule PASSES.
# ---------------------------------------------------------------------------

def _has_manufacturer(e: ExtractedData) -> bool:
    # Rule 6(1)(a)
    return _text(e.manufacturer_packer_importer)


def _has_product_name(e: ExtractedData) -> bool:
    # Rule 6(1)(b) — common/generic name of the commodity.
    # NOTE: `product_name` is read defensively; if the extractor does not yet
    # return it, this rule will fail (see getattr fallback).
    return _text(getattr(e, "product_name", None))


def _net_quantity_standard(e: ExtractedData) -> bool:
    # Rule 6(1)(c) — present, has a value, and unit is a standard metric unit.
    nq = e.net_quantity
    if nq is None or not _text(nq.value):
        return False
    return _canonical_unit(nq.unit) in STANDARD_UNITS


def _has_mfg_date(e: ExtractedData) -> bool:
    # Rule 6(1)(d)
    return _text(e.mfg_or_pack_date)


def _has_mrp(e: ExtractedData) -> bool:
    # Rule 6(1)(e)
    return e.mrp is not None and _text(e.mrp.value)


def _mrp_tax_inclusive(e: ExtractedData) -> bool:
    # Rule 2(m) — MRP must be declared inclusive of all taxes.
    # Only meaningful when an MRP exists; if MRP is missing, Rule 6(1)(e) already
    # covers it, so skip (pass) here to avoid double-firing.
    if not _has_mrp(e):
        return True
    return bool(e.mrp.inclusive_of_taxes_stated)


def _has_consumer_care(e: ExtractedData) -> bool:
    # Rule 6(2)
    return _text(e.consumer_care)


def _net_quantity_not_prohibited_unit(e: ExtractedData) -> bool:
    # Rule 13(4) — reject non-standard units (dozen/score/gross/pieces).
    # Only meaningful when net_quantity is present; if it's missing, Rule 6(1)(c)
    # already covers it, so skip (pass) here to avoid double-firing.
    nq = e.net_quantity
    if nq is None or not _text(nq.unit):
        return True
    return _canonical_unit(nq.unit) not in NON_STANDARD_UNITS


# ---------------------------------------------------------------------------
# The 8 rules — deterministic Legal Metrology checks.
# ---------------------------------------------------------------------------

RuleCheck = Callable[[ExtractedData], bool]

RULES: List[dict] = [
    {
        "field": "manufacturer_packer_importer",
        "rule_ref": "Rule 6(1)(a)",
        "issue": "Name and address of manufacturer/packer/importer missing",
        "check": _has_manufacturer,
    },
    {
        "field": "product_name",
        "rule_ref": "Rule 6(1)(b)",
        "issue": "Common or generic name of the commodity not declared",
        "check": _has_product_name,
    },
    {
        "field": "net_quantity",
        "rule_ref": "Rule 6(1)(c)",
        "issue": "Net quantity missing or not in standard metric units",
        "check": _net_quantity_standard,
    },
    {
        "field": "mfg_or_pack_date",
        "rule_ref": "Rule 6(1)(d)",
        "issue": "Month and year of manufacture/packing/import not declared",
        "check": _has_mfg_date,
    },
    {
        "field": "mrp",
        "rule_ref": "Rule 6(1)(e)",
        "issue": "Retail sale price (MRP) not declared",
        "check": _has_mrp,
    },
    {
        "field": "mrp",
        "rule_ref": "Rule 2(m)",
        "issue": "MRP not declared as inclusive of all taxes",
        "check": _mrp_tax_inclusive,
    },
    {
        "field": "consumer_care",
        "rule_ref": "Rule 6(2)",
        "issue": "Consumer care details (name, address, phone, email) missing",
        "check": _has_consumer_care,
    },
    {
        "field": "net_quantity",
        "rule_ref": "Rule 13(4)",
        "issue": "Net quantity uses a non-standard unit (e.g. dozen/score/gross)",
        "check": _net_quantity_not_prohibited_unit,
    },
]


def check_compliance_rules(extracted: ExtractedData) -> Tuple[List[Violation], str]:
    """
    Evaluate the 8 Legal Metrology rules against extracted label data.

    Returns:
        Tuple[List[Violation], str]: (violations_list, status_string)
    """
    violations: List[Violation] = []

    for rule in RULES:
        passed = rule["check"](extracted)
        if not passed:
            violations.append(
                Violation(
                    field=rule["field"],
                    issue=rule["issue"],
                    rule_ref=rule["rule_ref"],
                )
            )

    status = "flagged" if violations else "compliant"
    return violations, status
