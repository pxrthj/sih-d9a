"""The public /verify endpoint must stay minimal — the guard on Invariant #9.

The scan id printed on a notice is an unguessable credential, and the verify
route is public. It must return only what is already printed on that notice and
never the evidence photos, the officer's email, the owning user id, or any other
extracted declaration. Widening it turns that id into a data leak, so this pins
the response shape hard: exact top-level keys, and no sensitive value anywhere
in the serialised body.
"""
from tests.conftest import FakeSupabase

# Sentinels seeded into the record. None of these are printed on the notice, so
# none may appear in the verification response.
SECRET_USER = "secret-user-uuid-0000"
SECRET_PHOTO = "evidence-secret-photo.jpg"
SECRET_EMAIL = "officer-secret@dept.gov"
SECRET_CARE = "SECRET-CARE-PHONE-99999"

EXPECTED_KEYS = {
    "notice_ref",
    "status",
    "inspection_date",
    "officer_name",
    "category",
    "product_name",
    "manufacturer",
    "violations",
    "advisories",
}


def _fixture() -> FakeSupabase:
    return FakeSupabase(
        profiles={
            SECRET_USER: {"full_name": "Officer Real Name", "email": SECRET_EMAIL, "role": "officer", "status": "active"},
        },
        scans={
            "s1": {
                "id": "s1",
                "user_id": SECRET_USER,
                "storage_path": f"{SECRET_PHOTO} | back.jpg",
                "status": "flagged",
                "category": "Food & Beverages",
                "created_at": "2026-08-29T04:00:00+00:00",
                "extracted": {
                    "product_name": "Potato Chips",
                    "manufacturer_packer_importer": "XYZ Foods Ltd, Pune",
                    "consumer_care": SECRET_CARE,
                    "mrp": {"value": "Rs 20", "inclusive_of_taxes_stated": True},
                },
                "violations": [
                    {"field": "mrp", "issue": "MRP not declared", "rule_ref": "Rule 6(1)(e)", "internal_note": "leak-me"},
                ],
                "advisories": [
                    {"field": "evidence", "issue": "Only one photo", "rule_ref": "Evidence coverage", "debug": "leak-me"},
                ],
            },
        },
    )


def test_verify_returns_exactly_the_notice_fields(make_client):
    client = make_client(_fixture())
    res = client.get("/api/scans/s1/verify")
    assert res.status_code == 200
    body = res.json()
    assert set(body.keys()) == EXPECTED_KEYS
    # The fields that ARE printed on the notice still come through.
    assert body["product_name"] == "Potato Chips"
    assert body["manufacturer"] == "XYZ Foods Ltd, Pune"
    assert body["officer_name"] == "Officer Real Name"


def test_verify_never_leaks_sensitive_record_fields(make_client):
    client = make_client(_fixture())
    raw = client.get("/api/scans/s1/verify").text
    for secret in (SECRET_USER, SECRET_PHOTO, SECRET_EMAIL, SECRET_CARE):
        assert secret not in raw, f"verify response leaked {secret!r}"


def test_verify_violations_expose_only_three_fields(make_client):
    client = make_client(_fixture())
    body = client.get("/api/scans/s1/verify").json()
    allowed = {"field", "issue", "rule_ref"}
    for item in body["violations"] + body["advisories"]:
        assert set(item.keys()) <= allowed, f"unexpected keys: {set(item.keys()) - allowed}"


def test_verify_unknown_reference_is_not_found(make_client):
    client = make_client(_fixture())
    res = client.get("/api/scans/no-such-id/verify")
    assert res.status_code == 404
