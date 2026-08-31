"""
Legal Metrology (Packaged Commodities) Rules, 2011 — compliance checks.

These are DETERMINISTIC Python checks over the already-extracted JSON. No AI is
involved here. A rule "fails" (produces a violation) when its `check` returns
False; a passing rule produces nothing.

The output shape is unchanged: a list of Violation{ field, issue, rule_ref } and
an overall status ("compliant" when there are no violations, else "flagged").

HOW TO EDIT (for non-programmers / the legal team):
  - The 11 rules live in the RULES list at the bottom. Each entry has a plain-
    English `issue`, its `rule_ref`, and a small `check` function.
  - To change wording, edit the `issue` / `rule_ref` strings.
  - To change what counts as a valid unit, edit STANDARD_UNITS / UNIT_ALIASES /
    NON_STANDARD_UNITS below.
  - To add/remove a rule, add/remove an entry in RULES.

ADVISORIES (see build_advisories at the bottom) are a SEPARATE, weaker output.
They are observations for the officer to check by hand — never rule failures —
and they never change the compliance status. Anything we can see in a photo but
cannot adjudicate from one belongs there, not in RULES.
"""

import re
from typing import Callable, Dict, List, Optional, Tuple
from app.schemas.scan import Advisory, ExtractedData, Violation


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

# Month spellings accepted in a date declaration (Rule 6(1)(d)). Listed in full
# rather than matched by prefix, so "March" counts as a month and "Marketed"
# does not.
MONTH_WORDS = {
    "jan", "january", "feb", "february", "mar", "march", "apr", "april",
    "may", "jun", "june", "jul", "july", "aug", "august",
    "sep", "sept", "september", "oct", "october", "nov", "november",
    "dec", "december",
}

# Spellings the extractor may return for `declaration_language`, normalised to
# 'english', 'hindi', 'both' or 'other' (Rule 9(4)).
LANGUAGE_ALIASES = {
    "en": "english", "eng": "english",
    "hi": "hindi", "devnagri": "hindi", "devanagari": "hindi",
    "hindi (devanagari)": "hindi", "hindi (devnagri)": "hindi",
    "hindi and english": "both", "english and hindi": "both", "bilingual": "both",
    "neither": "other", "none": "other",
}

# Only a positive report of "other" breaches Rule 9(4). Anything else — including
# a language the extractor did not report — leaves the rule silent.
NON_COMPLIANT_LANGUAGES = {"other"}


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


def _canonical_language(value: Optional[str]) -> Optional[str]:
    """Normalise a reported declaration language, or None when nothing was reported."""
    lang = (value or "").strip().lower()
    if not lang:
        return None
    return LANGUAGE_ALIASES.get(lang, lang)


_WORDS = re.compile(r"[a-z]+")
_DIGITS = re.compile(r"\d+")


def _states_month_and_year(text: str) -> bool:
    """True when a printed date carries BOTH a month and a year.

    Rule 6(1)(d) asks for "the month and year in which the commodity is
    manufactured or pre-packed", so "06/2026" and "JUN 2026" qualify while a
    bare "2026" or an ink-jetted "24" does not.

    Deliberately tolerant about separators and spelling — it decides whether a
    month and a year are present, not whether the date follows any house style.
    Where a two-number date is ambiguous ("26/06" could be a day and a month
    with no year at all) it passes: on a document that becomes a legal notice,
    under-flagging is the safer error.
    """
    lowered = text.lower()
    numbers = _DIGITS.findall(lowered)

    # A spelled month ("JUN 2026") only needs a year-shaped number beside it.
    if any(word in MONTH_WORDS for word in _WORDS.findall(lowered)):
        return any(len(n) in (2, 4) for n in numbers)

    # Otherwise one number has to read as the month and another as the year.
    for i, month in enumerate(numbers):
        if len(month) > 2 or not 1 <= int(month) <= 12:
            continue
        if any(len(year) in (2, 4) for j, year in enumerate(numbers) if j != i):
            return True
    return False


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


def _mfg_date_states_month_and_year(e: ExtractedData) -> bool:
    # Rule 6(1)(d) — the declaration must give the month AND the year, not just
    # one of them. Guarded: when the date is absent altogether the presence rule
    # already covers it, so this stays silent rather than reporting one defect
    # as two offences.
    if not _text(e.mfg_or_pack_date):
        return True
    return _states_month_and_year(e.mfg_or_pack_date)


def _country_of_origin_for_imports(e: ExtractedData) -> bool:
    # Rule 6(1)(aa) — an imported package must name its country of origin,
    # manufacture or assembly. Guarded on the pack actually presenting as
    # imported: a domestic pack has nothing to declare here, and `None` means
    # the photographs could not tell, which is not evidence of a breach.
    if not getattr(e, "import_declared", None):
        return True
    return _text(getattr(e, "country_of_origin", None))


def _declarations_in_hindi_or_english(e: ExtractedData) -> bool:
    # Rule 9(4) — "The particulars of the declarations ... shall either be in
    # Hindi in Devnagri script or in English". Any additional language is
    # expressly permitted by the proviso, so only declarations printed in
    # NEITHER are a breach. An unreported language leaves the rule silent.
    lang = _canonical_language(getattr(e, "declaration_language", None))
    if lang is None:
        return True
    return lang not in NON_COMPLIANT_LANGUAGES


# ---------------------------------------------------------------------------
# The 11 rules — deterministic Legal Metrology checks.
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
        "field": "country_of_origin",
        "rule_ref": "Rule 6(1)(aa)",
        "issue": "Imported package does not declare its country of origin, manufacture or assembly",
        "check": _country_of_origin_for_imports,
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
        "field": "mfg_or_pack_date",
        "rule_ref": "Rule 6(1)(d)",
        "issue": "Date of manufacture/packing does not state both a month and a year",
        "check": _mfg_date_states_month_and_year,
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
    {
        "field": "declaration_language",
        "rule_ref": "Rule 9(4)",
        "issue": "Declarations are not printed in Hindi (Devnagri script) or in English",
        "check": _declarations_in_hindi_or_english,
    },
]


# ---------------------------------------------------------------------------
# Per-category rules (hook).
#
# Every product category runs the EXACT SAME 11 Legal Metrology rules above.
# This mapping is EMPTY, and now deliberately so rather than merely pending.
#
# WHY IT IS EMPTY (checked, so nobody re-treads this): the obvious candidate was
# Rule 5 read with the Second Schedule, which required certain commodities — tea,
# biscuits, baby food, cement, paint, aerated drinks — to be packed only in
# prescribed standard quantities. That would have been a genuine per-category
# rule, and it is checkable from a photograph. But Rule 5 and the Second Schedule
# were OMITTED by amendment: a commodity may now lawfully be packed in any size.
# Checking a net quantity against a prescribed pack size would therefore raise a
# violation citing a provision that no longer exists.
#
# The hook stays, because a real per-category Legal Metrology rule can still be
# added by mapping a category name to a list of extra rule dicts (same shape as
# RULES). Do NOT add FSSAI, nutrition or pricing rules here.
# ---------------------------------------------------------------------------
CATEGORY_RULES: Dict[str, List[dict]] = {}


def check_compliance_rules(
    extracted: ExtractedData,
    category: Optional[str] = None,
) -> Tuple[List[Violation], str]:
    """
    Evaluate the 11 Legal Metrology rules against extracted label data.

    `category` is accepted so future per-category rules can be looked up, but
    today every category runs the same 11 base checks (CATEGORY_RULES is empty
    by design — see the note above it).

    Returns:
        Tuple[List[Violation], str]: (violations_list, status_string)
    """
    violations: List[Violation] = []

    # Base rules run for every category, followed by any category-specific extras
    # (none today — CATEGORY_RULES is empty by design).
    applicable_rules = RULES + CATEGORY_RULES.get(category or "", [])

    for rule in applicable_rules:
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

# ---------------------------------------------------------------------------
# Advisories — observations, not verdicts.
#
# These never affect `status` and never appear in the violations list. They
# exist for findings that are real and worth an officer's attention but cannot
# be adjudicated from a photograph.
# ---------------------------------------------------------------------------

# Print sizes the extractor may report for a combined declaration block that we
# treat as "smaller than the surrounding artwork".
SMALL_PRINT_SIZES = {"small", "very_small", "verysmall", "tiny", "micro"}

# NOTE FOR THE LEGAL TEAM: the Packaged Commodities Rules prescribe a minimum
# height for declaration lettering (see the Rules' legibility provision and the
# Second Schedule). Confirm the exact rule/schedule number before this string is
# quoted in an issued notice — it is deliberately descriptive, not a citation.
LEGIBILITY_REF = "LMPC 2011 — legibility of declarations"
EVIDENCE_REF = "Evidence quality"
COVERAGE_REF = "Evidence coverage"


def _pretty(field_key: str) -> str:
    """'lot_batch_number' -> 'Lot/batch number' for use in advisory prose."""
    label = field_key.replace("_", " ").strip()
    label = label.replace("mrp", "MRP").replace("lot batch number", "lot/batch number")
    return label[:1].upper() + label[1:] if label else field_key


def build_advisories(
    extracted: ExtractedData,
    image_count: int = 0,
) -> List[Advisory]:
    """
    Observations for the officer, derived from what the extractor could see.

    Args:
        extracted: the extracted label data.
        image_count: how many photographs the officer supplied.

    Returns:
        List[Advisory]: possibly empty. Never affects compliance status.
    """
    advisories: List[Advisory] = []

    block = getattr(extracted, "declaration_block", None)
    if block is not None:
        size = (block.print_size or "").strip().lower().replace(" ", "_").replace("-", "_")
        grouped = bool(block.stacked_together) and len(block.fields_in_block or []) >= 2

        if size in SMALL_PRINT_SIZES:
            where = f" ({block.location_note})" if block.location_note else ""
            readable_size = size.replace("_", " ")
            if grouped:
                names = ", ".join(_pretty(f) for f in block.fields_in_block)
                issue = (
                    f"{names} are printed together in a single compact block in {readable_size} "
                    f"type{where}. Grouping declarations in one place is permitted, but each must "
                    "still meet the prescribed minimum letter height — measure it on the physical "
                    "package before deciding."
                )
            else:
                issue = (
                    f"Declarations appear in {readable_size} type{where}. Verify the letter height "
                    "against the prescribed minimum on the physical package."
                )
            advisories.append(
                Advisory(field="declaration_block", issue=issue, rule_ref=LEGIBILITY_REF)
            )

        if block.legible_in_photo is False:
            advisories.append(
                Advisory(
                    field="declaration_block",
                    issue=(
                        "The declaration block could not be read reliably from these photographs. "
                        "Re-scan with a close-up of that block, or verify the values by hand before "
                        "issuing a notice — a declaration that is present but unreadable here will "
                        "be reported as missing."
                    ),
                    rule_ref=EVIDENCE_REF,
                )
            )

    if 0 < image_count < 2:
        advisories.append(
            Advisory(
                field="evidence",
                issue=(
                    "Only one photograph was supplied. A declaration printed on a panel that was "
                    "not photographed is reported as missing — add the remaining panels if any "
                    "violation below looks doubtful."
                ),
                rule_ref=COVERAGE_REF,
            )
        )

    return advisories
