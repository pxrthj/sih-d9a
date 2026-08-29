"""Ownership and the auth gate — the guard on Invariant #5.

Ownership of a scan comes from the authenticated token, never the request body,
and only the owner or an admin may read a record. These are the endpoints where
that is enforced; if the check regresses, one of these fails.
"""
from tests.conftest import FakeSupabase


def _fixture() -> FakeSupabase:
    """One officer who owns a scan, a second officer, an admin, and a pending
    (unauthorised) user — plus a two-photo scan owned by the first officer."""
    return FakeSupabase(
        users={
            "tok-a": {"id": "officer-a", "email": "a@dept.gov"},
            "tok-b": {"id": "officer-b", "email": "b@dept.gov"},
            "tok-admin": {"id": "admin-1", "email": "admin@dept.gov"},
            "tok-pending": {"id": "pending-1", "email": "new@dept.gov"},
        },
        profiles={
            "officer-a": {"full_name": "Officer A", "email": "a@dept.gov", "role": "officer", "status": "active"},
            "officer-b": {"full_name": "Officer B", "email": "b@dept.gov", "role": "officer", "status": "active"},
            "admin-1": {"full_name": "Admin", "email": "admin@dept.gov", "role": "admin", "status": "active"},
            "pending-1": {"full_name": "New", "email": "new@dept.gov", "role": "none", "status": "active"},
        },
        scans={
            "s1": {"id": "s1", "user_id": "officer-a", "storage_path": "x.jpg | y.jpg", "status": "flagged"},
        },
    )


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_owner_can_read_their_evidence(make_client):
    client = make_client(_fixture())
    res = client.get("/api/scans/s1/evidence", headers=_auth("tok-a"))
    assert res.status_code == 200
    urls = [img["url"] for img in res.json()["images"]]
    assert urls == ["signed://x.jpg?ttl=3600", "signed://y.jpg?ttl=3600"]


def test_admin_can_read_any_scan(make_client):
    client = make_client(_fixture())
    res = client.get("/api/scans/s1/evidence", headers=_auth("tok-admin"))
    assert res.status_code == 200


def test_another_officer_cannot_read_someone_elses_scan(make_client):
    client = make_client(_fixture())
    res = client.get("/api/scans/s1/evidence", headers=_auth("tok-b"))
    assert res.status_code == 403


def test_missing_token_is_unauthenticated(make_client):
    client = make_client(_fixture())
    res = client.get("/api/scans/s1/evidence")
    assert res.status_code == 401


def test_invalid_token_is_unauthenticated(make_client):
    client = make_client(_fixture())
    res = client.get("/api/scans/s1/evidence", headers=_auth("tok-nonsense"))
    assert res.status_code == 401


def test_unauthorised_profile_is_forbidden(make_client):
    """A real user whose profile role is 'none' is rejected by the auth gate."""
    client = make_client(_fixture())
    res = client.get("/api/scans/s1/evidence", headers=_auth("tok-pending"))
    assert res.status_code == 403


def test_unknown_scan_is_not_found(make_client):
    client = make_client(_fixture())
    res = client.get("/api/scans/does-not-exist/evidence", headers=_auth("tok-a"))
    assert res.status_code == 404
