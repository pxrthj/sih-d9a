"""Tests for the seal over what the model read.

The seal exists for one reason: an officer may correct the extraction before it
becomes a record, and a record that says "the model read X, the officer changed
it to Y" is only worth anything if X cannot be chosen by whoever changed it.
Every test here is a statement about that guarantee.
"""
import time

import pytest

from app.services.extraction_seal import (
    SEAL_TTL_SECONDS,
    seal_extraction,
    verify_extraction,
)

SECRET = "service-role-key-for-tests"
READING = {"product_name": "Potato Chips", "mrp": {"value": "20.00"}}


def test_a_sealed_reading_verifies():
    seal = seal_extraction(READING, SECRET)
    ok, _ = verify_extraction(READING, seal, SECRET)
    assert ok


def test_changing_the_reading_breaks_the_seal():
    """The whole point: the original cannot be edited to hide a correction."""
    seal = seal_extraction(READING, SECRET)
    forged = {**READING, "mrp": {"value": "999.00"}}
    ok, reason = verify_extraction(forged, seal, SECRET)
    assert not ok
    assert "verified" in reason.lower()


def test_a_seal_cannot_be_invented_without_the_key():
    seal = seal_extraction(READING, "some-other-servers-key")
    ok, _ = verify_extraction(READING, seal, SECRET)
    assert not ok


@pytest.mark.parametrize("seal", [None, {}, {"signature": "abc"}, {"issued_at": 1}, "nonsense"])
def test_a_missing_or_malformed_seal_is_refused(seal):
    ok, reason = verify_extraction(READING, seal, SECRET)  # type: ignore[arg-type]
    assert not ok
    assert reason  # the officer is told to scan again, not shown a blank error


def test_a_stale_seal_is_refused():
    seal = seal_extraction(READING, SECRET)
    seal["issued_at"] -= SEAL_TTL_SECONDS + 60
    ok, reason = verify_extraction(READING, seal, SECRET)
    assert not ok
    assert "too long" in reason.lower()


def test_a_seal_from_the_future_is_refused():
    seal = seal_extraction(READING, SECRET)
    seal["issued_at"] = int(time.time()) + 600
    ok, _ = verify_extraction(READING, seal, SECRET)
    assert not ok


def test_the_timestamp_is_covered_by_the_signature():
    """Otherwise a captured seal could be replayed indefinitely by bumping it."""
    seal = seal_extraction(READING, SECRET)
    seal["issued_at"] += 1
    ok, _ = verify_extraction(READING, seal, SECRET)
    assert not ok


def test_key_order_does_not_change_the_signature():
    """Python keeps insertion order; the same reading must seal identically."""
    a = seal_extraction({"a": 1, "b": 2}, SECRET)
    ok, _ = verify_extraction({"b": 2, "a": 1}, a, SECRET)
    assert ok
