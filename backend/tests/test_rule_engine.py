"""Tests for the deterministic Legal Metrology rule engine.

The engine is the part of the system that produces a legal verdict, so it is
the part that has to be pinned down: pure functions, no I/O, no model. Every
test here is a statement about what the law check does, not about how it is
written.
"""
import pytest

from app.rules.engine import check_compliance_rules
from app.schemas.scan import ExtractedData, MRP, NetQuantity


def compliant(**overrides) -> ExtractedData:
    """A package that satisfies every rule, before any override."""
    data = {
        "product_name": "Potato Chips",
        "manufacturer_packer_importer": "Shubh Foods Pvt Ltd, Plot 14, MIDC Bhosari, Pune 411026",
        "net_quantity": NetQuantity(value="52", unit="g"),
        "mrp": MRP(value="Rs 20.00", inclusive_of_taxes_stated=True),
        "mfg_or_pack_date": "06/2026",
        "consumer_care": "care@shubhfoods.example, 1800-000-000",
    }
    data.update(overrides)
    return ExtractedData(**data)


def refs(extracted: ExtractedData) -> set[str]:
    violations, _ = check_compliance_rules(extracted)
    return {v.rule_ref for v in violations}


# --------------------------------------------------------------------------
# The baseline
# --------------------------------------------------------------------------

def test_compliant_package_produces_no_violations():
    violations, status = check_compliance_rules(compliant())
    assert violations == []
    assert status == "compliant"


def test_status_is_flagged_when_anything_fails():
    _, status = check_compliance_rules(compliant(consumer_care=None))
    assert status == "flagged"


# --------------------------------------------------------------------------
# One missing declaration -> exactly one rule, and the right one
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "field, expected_ref",
    [
        ("manufacturer_packer_importer", "Rule 6(1)(a)"),
        ("product_name", "Rule 6(1)(b)"),
        ("net_quantity", "Rule 6(1)(c)"),
        ("mfg_or_pack_date", "Rule 6(1)(d)"),
        ("consumer_care", "Rule 6(2)"),
    ],
)
def test_each_missing_declaration_cites_its_own_rule(field, expected_ref):
    violations, status = check_compliance_rules(compliant(**{field: None}))
    assert [v.rule_ref for v in violations] == [expected_ref]
    assert violations[0].field == field
    assert status == "flagged"


@pytest.mark.parametrize("blank", ["", "   ", "\n\t "])
def test_whitespace_only_counts_as_not_declared(blank):
    assert "Rule 6(1)(a)" in refs(compliant(manufacturer_packer_importer=blank))


def test_every_rule_carries_a_citation_and_a_readable_issue():
    violations, _ = check_compliance_rules(ExtractedData())
    assert violations, "an empty label should fail several rules"
    for v in violations:
        assert v.rule_ref.strip(), "a violation without a citation is not defensible"
        assert len(v.issue.split()) >= 4, f"issue text too terse to show an officer: {v.issue!r}"


# --------------------------------------------------------------------------
# Net quantity: units are normalised before they are judged
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "unit",
    ["g", "G", " g ", "g.", "gm", "GMS", "gram", "Grams", "kg", "KILOGRAMS",
     "ml", "Millilitre", "ltr", "Litres", "mg", "cm", "m", "nos", "units"],
)
def test_standard_and_aliased_units_pass(unit):
    assert "Rule 6(1)(c)" not in refs(compliant(net_quantity=NetQuantity(value="52", unit=unit)))


@pytest.mark.parametrize("unit", ["dozen", "Dozens", "score", "gross", "pcs", "pieces"])
def test_prohibited_units_are_rejected_under_13_4(unit):
    found = refs(compliant(net_quantity=NetQuantity(value="12", unit=unit)))
    assert "Rule 13(4)" in found


@pytest.mark.parametrize("unit", ["furlong", "handful", "sack", ""])
def test_unrecognised_units_fail_the_standard_unit_rule(unit):
    assert "Rule 6(1)(c)" in refs(compliant(net_quantity=NetQuantity(value="2", unit=unit)))


def test_quantity_without_a_value_is_not_a_declaration():
    assert "Rule 6(1)(c)" in refs(compliant(net_quantity=NetQuantity(value="  ", unit="g")))


# --------------------------------------------------------------------------
# MRP and its tax wording
# --------------------------------------------------------------------------

def test_mrp_without_tax_wording_fires_rule_2m():
    found = refs(compliant(mrp=MRP(value="Rs 20.00", inclusive_of_taxes_stated=False)))
    assert found == {"Rule 2(m)"}


# --------------------------------------------------------------------------
# Guards: one defect must not be reported as two offences
# --------------------------------------------------------------------------

def test_missing_mrp_does_not_also_fire_the_tax_rule():
    found = refs(compliant(mrp=None))
    assert "Rule 6(1)(e)" in found
    assert "Rule 2(m)" not in found, "a package with no price cannot also mis-state its tax wording"


def test_missing_quantity_does_not_also_fire_the_prohibited_unit_rule():
    found = refs(compliant(net_quantity=None))
    assert "Rule 6(1)(c)" in found
    assert "Rule 13(4)" not in found, "a package with no quantity has no unit to prohibit"


def test_a_blank_label_fails_every_rule_exactly_once():
    violations, status = check_compliance_rules(ExtractedData())
    cited = [v.rule_ref for v in violations]
    assert status == "flagged"
    assert len(cited) == len(set(cited)), "no rule should fire twice for one package"
    # The two guarded rules stay silent when the field they qualify is absent.
    assert set(cited) == {
        "Rule 6(1)(a)", "Rule 6(1)(b)", "Rule 6(1)(c)",
        "Rule 6(1)(d)", "Rule 6(1)(e)", "Rule 6(2)",
    }


# --------------------------------------------------------------------------
# Category is recorded, not adjudicated
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "category",
    [None, "General", "Food & Beverages", "Textiles & Garments", "not-a-real-category"],
)
def test_every_category_runs_the_same_rules(category):
    baseline, _ = check_compliance_rules(compliant(consumer_care=None))
    violations, _ = check_compliance_rules(compliant(consumer_care=None), category=category)
    assert [v.rule_ref for v in violations] == [v.rule_ref for v in baseline]


# --------------------------------------------------------------------------
# Determinism is the whole point of doing this in Python
# --------------------------------------------------------------------------

def test_repeated_evaluation_is_identical():
    label = compliant(mrp=None, consumer_care=None)
    first = [(v.field, v.issue, v.rule_ref) for v in check_compliance_rules(label)[0]]
    for _ in range(5):
        assert [(v.field, v.issue, v.rule_ref) for v in check_compliance_rules(label)[0]] == first


# --------------------------------------------------------------------------
# Rule 6(1)(aa): country of origin, but only on packs that say they're imported
# --------------------------------------------------------------------------

def test_imported_pack_naming_its_origin_is_compliant():
    found = refs(compliant(import_declared=True, country_of_origin="Made in Vietnam"))
    assert "Rule 6(1)(aa)" not in found


def test_imported_pack_without_an_origin_breaches_6_1_aa():
    violations, status = check_compliance_rules(compliant(import_declared=True))
    assert [v.rule_ref for v in violations] == ["Rule 6(1)(aa)"]
    assert violations[0].field == "country_of_origin"
    assert status == "flagged"


@pytest.mark.parametrize("blank", ["", "   "])
def test_a_blank_origin_on_an_imported_pack_is_not_a_declaration(blank):
    assert "Rule 6(1)(aa)" in refs(compliant(import_declared=True, country_of_origin=blank))


def test_a_domestic_pack_has_no_origin_to_declare():
    assert "Rule 6(1)(aa)" not in refs(compliant(import_declared=False))


def test_an_unreadable_import_status_is_not_a_breach():
    """None means the photographs could not tell — that is not evidence of a breach."""
    assert "Rule 6(1)(aa)" not in refs(compliant(import_declared=None))


# --------------------------------------------------------------------------
# Rule 6(1)(d): the date must state a month AND a year
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "printed",
    ["06/2026", "06-2026", "2026-06", "JUN 2026", "June 2026", "JUN26",
     "12/06/2026", "MFG 06 2026", "Packed 03.24"],
)
def test_dates_carrying_a_month_and_a_year_pass(printed):
    assert "Rule 6(1)(d)" not in refs(compliant(mfg_or_pack_date=printed))


@pytest.mark.parametrize("printed", ["2026", "24", "06", "JUNE", "Best before 9 months from packing"])
def test_a_date_missing_its_month_or_year_breaches_6_1_d(printed):
    violations, status = check_compliance_rules(compliant(mfg_or_pack_date=printed))
    assert [v.rule_ref for v in violations] == ["Rule 6(1)(d)"]
    assert status == "flagged"


def test_a_missing_date_is_one_offence_not_two():
    """The presence rule and the format rule share a citation; only one may fire."""
    violations, _ = check_compliance_rules(compliant(mfg_or_pack_date=None))
    cited = [v.rule_ref for v in violations]
    assert cited.count("Rule 6(1)(d)") == 1
    assert "month and year" not in violations[0].issue, "a missing date is not a formatting defect"


# --------------------------------------------------------------------------
# Rule 9(4): declarations in Hindi (Devnagri) or English
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "reported",
    ["english", "English", " HINDI ", "hindi", "both", "en", "hi", "devanagari", "bilingual"],
)
def test_hindi_or_english_declarations_pass_9_4(reported):
    assert "Rule 9(4)" not in refs(compliant(declaration_language=reported))


@pytest.mark.parametrize("reported", ["other", "Other", "neither", "none"])
def test_declarations_in_neither_language_breach_9_4(reported):
    violations, status = check_compliance_rules(compliant(declaration_language=reported))
    assert [v.rule_ref for v in violations] == ["Rule 9(4)"]
    assert violations[0].field == "declaration_language"
    assert status == "flagged"


@pytest.mark.parametrize("reported", [None, "", "   "])
def test_an_unreported_language_is_not_a_breach(reported):
    """A photograph that cannot settle the question is not evidence of a breach."""
    assert "Rule 9(4)" not in refs(compliant(declaration_language=reported))


def test_an_additional_language_is_expressly_permitted():
    """The proviso to Rule 9(4) allows any other language IN ADDITION to Hindi/English."""
    assert "Rule 9(4)" not in refs(compliant(declaration_language="both"))
