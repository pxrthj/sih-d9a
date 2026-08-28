"""Tests for advisories — the engine's second, weaker output.

The invariant that matters most is the last one in this file: an advisory can
never change a compliance verdict. Everything else is about raising them for
the right reasons.
"""
import pytest

from app.rules.engine import build_advisories, check_compliance_rules
from app.schemas.scan import DeclarationBlock, ExtractedData, MRP, NetQuantity
from tests.test_rule_engine import compliant


def block(**overrides) -> DeclarationBlock:
    """The common real-world case: MRP, use-by and lot crammed into one box."""
    data = {
        "fields_in_block": ["mrp", "use_by_date", "lot_batch_number"],
        "stacked_together": True,
        "print_size": "very_small",
        "legible_in_photo": True,
        "location_note": "bottom of back panel, near the seam",
    }
    data.update(overrides)
    return DeclarationBlock(**data)


def kinds(advisories) -> set[str]:
    return {a.rule_ref for a in advisories}


# --------------------------------------------------------------------------
# When nothing is worth saying
# --------------------------------------------------------------------------

def test_no_advisories_for_a_normally_printed_label():
    assert build_advisories(compliant(), image_count=2) == []


def test_normal_print_size_raises_nothing():
    label = compliant(declaration_block=block(print_size="normal"))
    assert build_advisories(label, image_count=2) == []


# --------------------------------------------------------------------------
# Small print in a combined block
# --------------------------------------------------------------------------

@pytest.mark.parametrize("size", ["small", "very_small", "Very Small", "very-small", "TINY"])
def test_small_print_raises_a_legibility_advisory(size):
    label = compliant(declaration_block=block(print_size=size))
    advisories = build_advisories(label, image_count=2)
    assert len(advisories) == 1
    assert "legibility" in advisories[0].rule_ref.lower()


def test_the_legibility_advisory_names_the_fields_and_the_place():
    label = compliant(declaration_block=block())
    issue = build_advisories(label, image_count=2)[0].issue
    assert "MRP" in issue
    assert "near the seam" in issue
    assert "measure" in issue.lower(), "it must tell the officer what to actually do"


def test_grouping_alone_is_not_a_finding():
    """Declaring things together is permitted; only the size is questionable."""
    label = compliant(declaration_block=block(print_size="normal", stacked_together=True))
    assert build_advisories(label, image_count=3) == []


# --------------------------------------------------------------------------
# Evidence quality
# --------------------------------------------------------------------------

def test_illegible_block_raises_an_evidence_advisory():
    label = compliant(declaration_block=block(print_size="normal", legible_in_photo=False))
    assert kinds(build_advisories(label, image_count=2)) == {"Evidence quality"}


def test_unknown_legibility_is_not_treated_as_illegible():
    label = compliant(declaration_block=block(print_size="normal", legible_in_photo=None))
    assert build_advisories(label, image_count=2) == []


def test_small_and_illegible_raises_both():
    label = compliant(declaration_block=block(legible_in_photo=False))
    assert len(build_advisories(label, image_count=2)) == 2


# --------------------------------------------------------------------------
# Photo coverage
# --------------------------------------------------------------------------

def test_single_photo_warns_that_unphotographed_panels_read_as_missing():
    assert kinds(build_advisories(compliant(), image_count=1)) == {"Evidence coverage"}


@pytest.mark.parametrize("count", [2, 3, 4])
def test_two_or_more_photos_raise_no_coverage_advisory(count):
    assert build_advisories(compliant(), image_count=count) == []


def test_unknown_photo_count_raises_nothing():
    assert build_advisories(compliant(), image_count=0) == []


# --------------------------------------------------------------------------
# The invariant
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "label",
    [
        compliant(declaration_block=block()),
        compliant(declaration_block=block(legible_in_photo=False)),
        compliant(declaration_block=block(print_size="very_small"), mrp=MRP(value="Rs 5", inclusive_of_taxes_stated=True)),
    ],
)
def test_advisories_never_change_the_verdict(label):
    violations, status = check_compliance_rules(label)
    advisories = build_advisories(label, image_count=1)

    assert advisories, "this fixture is meant to raise at least one advisory"
    assert violations == [], "no advisory condition may add a violation"
    assert status == "compliant", "a compliant package stays compliant however it is printed"


def test_advisories_are_not_mixed_into_violations():
    label = compliant(
        consumer_care=None,
        net_quantity=NetQuantity(value="1", unit="dozen"),
        declaration_block=block(legible_in_photo=False),
    )
    violations, status = check_compliance_rules(label)
    advisories = build_advisories(label, image_count=1)

    assert status == "flagged"
    violation_refs = {v.rule_ref for v in violations}
    # "dozen" contravenes both the standard-unit requirement and the explicit
    # prohibition, so both are cited. The guards only suppress a rule when the
    # field it qualifies is absent entirely.
    assert violation_refs == {"Rule 6(2)", "Rule 6(1)(c)", "Rule 13(4)"}
    assert violation_refs.isdisjoint(kinds(advisories))
