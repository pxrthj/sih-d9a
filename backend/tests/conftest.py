"""Shared fixtures for the API-layer tests.

These tests exercise the real FastAPI endpoints and the real auth gate, with the
Supabase layer replaced by an in-memory fake — so nothing here touches the
network or needs real keys. Importing `app.main` validates the settings at
import time, so dummy env vars are set below before anything imports the app.
"""
import os

os.environ.setdefault("SUPABASE_URL", "http://test.local")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")
os.environ.setdefault("APP_BASE_URL", "http://localhost:5173")

from typing import Any, Dict, Optional  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.api import scans  # noqa: E402
from app.main import app  # noqa: E402


class FakeSupabase:
    """In-memory stand-in for SupabaseService.

    Configured with maps of access-token -> user, user id -> profile, and scan
    id -> row. Only the methods the endpoints under test actually call are
    implemented; anything else is intentionally absent so a test that reaches
    for real I/O fails loudly instead of silently hitting the network.
    """

    def __init__(
        self,
        users: Optional[Dict[str, Dict[str, Any]]] = None,
        profiles: Optional[Dict[str, Dict[str, Any]]] = None,
        scans: Optional[Dict[str, Dict[str, Any]]] = None,
    ) -> None:
        self.users = users or {}
        self.profiles = profiles or {}
        self.scans = scans or {}

    def get_user_from_token(self, token: str) -> Optional[Dict[str, Any]]:
        return self.users.get(token)

    def fetch_profile(self, user_id: Optional[str]) -> Optional[Dict[str, Any]]:
        return self.profiles.get(user_id) if user_id else None

    def fetch_scan(self, scan_id: str) -> Optional[Dict[str, Any]]:
        return self.scans.get(scan_id)

    def create_signed_url(self, path: Optional[str], expires_in: int = 3600) -> Optional[str]:
        return f"signed://{path}?ttl={expires_in}" if path else None


@pytest.fixture
def make_client():
    """Build a TestClient whose Supabase layer is the given fake.

    Overriding only `get_supabase_service` lets the real `get_current_user` and
    `_authorise_scan_access` run against the fake, so the actual auth/ownership
    logic is what gets tested.
    """
    created = []

    def _factory(fake: FakeSupabase) -> TestClient:
        app.dependency_overrides[scans.get_supabase_service] = lambda: fake
        client = TestClient(app)
        created.append(client)
        return client

    yield _factory
    app.dependency_overrides.clear()
