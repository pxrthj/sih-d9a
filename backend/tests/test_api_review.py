"""Tests for committing a reviewed extraction.

The officer can now correct what the model read before the record is written.
These tests pin down the two properties that make that safe: the verdict is
decided here and not by the caller, and the model's original reading is the
server's word, not the caller's.
"""
from typing import Any, Dict, List, Optional

import pytest

from app.api import scans
from app.main import app
from app.services.extraction_seal import seal_extraction
from tests.conftest import FakeSupabase

TOKEN = "officer-token"
OFFICER = {"id": "officer-1", "email": "officer@ves.ac.in"}
SECRET = "test-service-role-key"  # matches conftest's env default

# A package that satisfies all eight rules.
CLEAN: Dict[str, Any] = {
    "product_name": "Potato Chips",
    "manufacturer_packer_importer": "Shubh Foods Pvt Ltd, Pune 411026",
    "net_quantity": {"value": "52", "unit": "g"},
    "mrp": {"value": "Rs 20.00", "inclusive_of_taxes_stated": True},
    "mfg_or_pack_date": "06/2026",
    "use_by_date": None,
    "lot_batch_number": None,
    "consumer_care": "care@shubhfoods.example",
    "declarations_present": [],
    "declaration_block": None,
}


class RecordingSupabase(FakeSupabase):
    """A fake that remembers what the endpoint tried to write."""

    def __init__(self, **kw):
        super().__init__(**kw)
        self.saved: List[Dict[str, Any]] = []

    def save_scan_record(self, **kwargs) -> Dict[str, Any]:
        self.saved.append(kwargs)
        return {"id": "scan-1", **kwargs}


@pytest.fixture
def client(make_client):
    fake = RecordingSupabase(
        users={TOKEN: OFFICER},
        profiles={"officer-1": {"role": "officer", "status": "active"}},
    )
    c = make_client(fake)
    c.fake = fake  # type: ignore[attr-defined]
    return c


def commit(client, body: Dict[str, Any]):
    return client.post("/api/scans", json=body, headers={"Authorization": f"Bearer {TOKEN}"})


def sealed(reading: Dict[str, Any]) -> Dict[str, Any]:
    return seal_extraction(reading, SECRET)


def test_a_reviewed_scan_is_saved_without_calling_the_model(client):
    """Commit must not re-extract: the officer already reviewed that reading."""
    # No Gemini override is registered, so any call to it would fail loudly.
    res = commit(client, {
        "image_paths": ["a.jpg"],
        "extracted": CLEAN,
        "extracted_original": CLEAN,
        "seal": sealed(CLEAN),
    })
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "compliant"
    assert len(client.fake.saved) == 1


def test_corrections_are_recorded_field_by_field(client):
    corrected = {**CLEAN, "mrp": {"value": "Rs 45.00", "inclusive_of_taxes_stated": True}}
    res = commit(client, {
        "image_paths": ["a.jpg"],
        "extracted": corrected,
        "extracted_original": CLEAN,
        "seal": sealed(CLEAN),
    })
    assert res.status_code == 200, res.text
    assert res.json()["corrected_fields"] == ["mrp"]

    written = client.fake.saved[0]
    assert written["corrected_fields"] == ["mrp"]
    # Both readings survive: the record can still show what the photo said.
    assert written["extracted"]["mrp"]["value"] == "Rs 45.00"
    assert written["extracted_original"]["mrp"]["value"] == "Rs 20.00"


def test_an_untouched_review_records_no_corrections(client):
    res = commit(client, {
        "image_paths": ["a.jpg"],
        "extracted": CLEAN,
        "extracted_original": CLEAN,
        "seal": sealed(CLEAN),
    })
    assert res.json()["corrected_fields"] == []


def test_the_verdict_is_recomputed_from_what_the_officer_confirmed(client):
    """Correcting a field must move the verdict, not leave a stale one."""
    # The model missed the MRP entirely; the officer supplies it.
    missing_mrp = {**CLEAN, "mrp": None}
    res = commit(client, {
        "image_paths": ["a.jpg"],
        "extracted": CLEAN,
        "extracted_original": missing_mrp,
        "seal": sealed(missing_mrp),
    })
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "compliant"
    assert client.fake.saved[0]["status"] == "compliant"


def test_a_client_cannot_post_its_own_verdict(client):
    """status/violations in the body are ignored; the engine decides."""
    no_mrp = {**CLEAN, "mrp": None}
    res = commit(client, {
        "image_paths": ["a.jpg"],
        "extracted": no_mrp,
        "extracted_original": no_mrp,
        "seal": sealed(no_mrp),
        "status": "compliant",
        "violations": [],
    })
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "flagged"
    assert any(v["rule_ref"] == "Rule 6(1)(e)" for v in res.json()["violations"])


def test_a_forged_original_is_refused(client):
    """Seal the real reading, then claim the model read something else."""
    real_seal = sealed(CLEAN)
    forged = {**CLEAN, "mrp": {"value": "Rs 999.00", "inclusive_of_taxes_stated": True}}
    res = commit(client, {
        "image_paths": ["a.jpg"],
        "extracted": CLEAN,
        "extracted_original": forged,
        "seal": real_seal,
    })
    assert res.status_code == 400
    assert client.fake.saved == [], "nothing may be written when the seal fails"


def test_a_review_without_a_seal_is_refused(client):
    res = commit(client, {
        "image_paths": ["a.jpg"],
        "extracted": CLEAN,
        "extracted_original": CLEAN,
    })
    assert res.status_code == 422
    assert client.fake.saved == []


def test_ownership_still_comes_from_the_token(client):
    commit(client, {
        "image_paths": ["a.jpg"],
        "extracted": CLEAN,
        "extracted_original": CLEAN,
        "seal": sealed(CLEAN),
        "user_id": "somebody-else",
    })
    assert client.fake.saved[0]["user_id"] == "officer-1"


def test_a_reviewed_scan_still_needs_a_photo(client):
    res = commit(client, {
        "image_paths": [],
        "extracted": CLEAN,
        "extracted_original": CLEAN,
        "seal": sealed(CLEAN),
    })
    assert res.status_code == 422
