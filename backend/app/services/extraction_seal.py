"""A server-issued seal over what the model read, before anyone could edit it.

An officer may now correct the extraction before it becomes a record, which
raises an obvious question: when the record says "the model read X and the
officer changed it to Y", what stops the officer from also choosing X?

Nothing, if the client simply posts both halves back. So the extract step
returns the model's reading together with an HMAC of it, and the commit step
refuses any original whose seal does not verify. The client can hold the value
and hand it back, but it cannot author one, because the key never leaves the
server.

This keeps the flow stateless. The alternative -- caching each extraction
server-side against a token -- would lose an officer's review whenever the free
tier restarts or a second instance takes the request, which is a real failure
for someone standing in a shop with a package in hand.
"""

import hashlib
import hmac
import json
import logging
import time
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# A sealed extraction is meant to be reviewed and committed in one sitting. An
# hour is generous for that and still bounds how long a captured seal is worth
# replaying.
SEAL_TTL_SECONDS = 3600

_KEY_SALT = b"parakhmitra-extraction-seal-v1"


def _signing_key(secret: str) -> bytes:
    """Derive the seal key from a secret the server already holds.

    Deliberately not the raw service-role key: it is stretched through a
    domain-separated hash so this seal cannot be confused with, or used to
    probe, anything else that key protects. Rotating the service-role key
    invalidates seals in flight, which costs at most one re-scan.
    """
    return hashlib.sha256(_KEY_SALT + secret.encode("utf-8")).digest()


def _canonical(payload: Dict[str, Any], issued_at: int) -> bytes:
    """One byte string per (extraction, timestamp), stable across processes.

    sort_keys matters: Python preserves insertion order, so the same extraction
    serialised twice could otherwise differ and fail its own verification.
    """
    return json.dumps(
        {"extracted": payload, "issued_at": issued_at},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")


def seal_extraction(extracted: Dict[str, Any], secret: str) -> Dict[str, Any]:
    """Wrap a model reading with the timestamp and signature that attest to it."""
    issued_at = int(time.time())
    signature = hmac.new(
        _signing_key(secret), _canonical(extracted, issued_at), hashlib.sha256
    ).hexdigest()
    return {"issued_at": issued_at, "signature": signature}


def verify_extraction(
    extracted: Dict[str, Any],
    seal: Optional[Dict[str, Any]],
    secret: str,
) -> Tuple[bool, str]:
    """Check that this reading is the one this server issued, and recently.

    Returns (ok, reason). The reason is for the officer, so it says what to do.
    """
    if not seal or not isinstance(seal, dict):
        return False, "This scan is missing its extraction seal. Please scan the package again."

    signature = seal.get("signature")
    issued_at = seal.get("issued_at")
    if not isinstance(signature, str) or not isinstance(issued_at, int):
        return False, "This scan's extraction seal is malformed. Please scan the package again."

    age = int(time.time()) - issued_at
    if age > SEAL_TTL_SECONDS:
        return False, "This scan took too long to submit. Please scan the package again."
    # A clock that has run backwards is a broken seal, not a valid future one.
    if age < -60:
        return False, "This scan's extraction seal is not yet valid. Please scan the package again."

    expected = hmac.new(
        _signing_key(secret), _canonical(extracted, issued_at), hashlib.sha256
    ).hexdigest()

    # compare_digest, not ==: a plain comparison leaks where two signatures
    # first differ through how long it takes to fail.
    if not hmac.compare_digest(expected, signature):
        logger.warning("Rejected a scan whose extraction seal did not verify.")
        return False, "This scan's extracted data could not be verified. Please scan the package again."

    return True, ""
