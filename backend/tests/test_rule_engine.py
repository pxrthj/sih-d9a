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
    """A package that satisfies all eight rules, before any override."""
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
