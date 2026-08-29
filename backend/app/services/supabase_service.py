import mimetypes
import logging
from typing import Any, Dict, List, Optional
from supabase import Client, create_client
from app.config import Settings, get_settings

logger = logging.getLogger(__name__)


class SupabaseService:
    def __init__(self, settings: Optional[Settings] = None):
        self.settings = settings or get_settings()
        self.client: Client = create_client(
            self.settings.SUPABASE_URL,
            self.settings.SUPABASE_SERVICE_ROLE_KEY,
        )
        self.bucket_name = self.settings.STORAGE_BUCKET

    def fetch_image(self, storage_path: str) -> bytes:
        """
        Fetches an image file from Supabase Storage 'evidence-photos' bucket
        using the service role key.

        Args:
            storage_path: The filename/path within the bucket.

        Returns:
            bytes: The downloaded image binary content.

        Raises:
            FileNotFoundError: If the file is not found in the bucket.
            Exception: For other network or storage errors.
        """
        logger.info(f"Fetching image from bucket '{self.bucket_name}': {storage_path}")
        try:
            image_bytes = self.client.storage.from_(self.bucket_name).download(storage_path)
            if not image_bytes:
                raise FileNotFoundError(f"Storage object '{storage_path}' is empty or not found.")
            return image_bytes
        except Exception as exc:
            err_msg = str(exc)
            if "not_found" in err_msg.lower() or "404" in err_msg:
                raise FileNotFoundError(f"Image '{storage_path}' not found in bucket '{self.bucket_name}'.") from exc
            logger.error(f"Error downloading '{storage_path}' from bucket '{self.bucket_name}': {exc}")
            raise

    def create_signed_url(self, storage_path: Optional[str], expires_in: int = 3600) -> Optional[str]:
        """
        Mint a short-lived signed URL for an object in the evidence bucket.

        Uses the service-role key, so it does not depend on any storage RLS
        policy or on the object's `owner` column being populated. Callers must
        authorise the request themselves (owner-or-admin) before handing the
        URL out. Returns None if the path is empty or signing fails.
        """
        clean = (storage_path or "").strip()
        if not clean:
            return None
        try:
            result = self.client.storage.from_(self.bucket_name).create_signed_url(clean, expires_in)
        except Exception as exc:
            logger.warning(f"Could not sign '{clean}' in bucket '{self.bucket_name}': {exc}")
            return None
        if isinstance(result, dict):
            # supabase-py has used both spellings across versions.
            return result.get("signedURL") or result.get("signedUrl") or result.get("signed_url")
        return getattr(result, "signed_url", None)

    def get_mime_type(self, storage_path: str) -> str:
        """Guesses MIME type from file extension, default to image/jpeg."""
        mime_type, _ = mimetypes.guess_type(storage_path)
        if not mime_type or not mime_type.startswith("image/"):
            return "image/jpeg"
        return mime_type

    def get_user_from_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Validate a Supabase access token (the JWT the frontend holds after login)
        against the Supabase auth server and return the user id/email, or None if
        the token is missing/invalid/expired. Used to authenticate API callers.
        """
        if not token:
            return None
        try:
            resp = self.client.auth.get_user(token)
        except Exception as exc:
            logger.info(f"Access token validation failed: {exc}")
            return None
        user = getattr(resp, "user", None)
        if not user or not getattr(user, "id", None):
            return None
        return {"id": user.id, "email": getattr(user, "email", None)}

    def fetch_scan(self, scan_id: str) -> Optional[Dict[str, Any]]:
        """Read a single scan record by id (read-only; used for report generation)."""
        response = self.client.table("scans").select("*").eq("id", scan_id).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None

    def fetch_profile(self, user_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """Read a profile (name/email/role/status) by auth id. Read-only.
        Used both for officer attribution and for authorising API callers."""
        if not user_id:
            return None
        response = (
            self.client.table("profiles")
            .select("full_name, email, role, status")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None

    def save_scan_record(
        self,
        image_paths: List[str],
        extracted: Dict[str, Any],
        violations: List[Dict[str, Any]],
        status: str,
        advisories: Optional[List[Dict[str, Any]]] = None,
        user_id: Optional[str] = None,
        category: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        location_accuracy: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Insert a row into the Supabase 'scans' table.

        `storage_path` is the canonical record of the evidence photos: the 1 to 4
        filenames pipe-joined in capture order ("front.jpg | back.jpg | side.jpg").
        front_path/back_path are also written, for the first two images only, so
        older readers keep working.

        Optional columns (front_path, back_path, advisories, category, latitude,
        longitude, location_accuracy) may not exist in a project whose schema.sql
        has not been re-run; each missing column is dropped and the insert retried,
        so the rest of the record still saves.

        Returns:
            Dict[str, Any]: the inserted database record.
        """
        combined_storage_path = " | ".join(image_paths)
        core_payload: Dict[str, Any] = {
            "storage_path": combined_storage_path,
            "extracted": extracted,
            "violations": violations,
            "status": status,
        }
        if user_id:
            core_payload["user_id"] = user_id

        optional_payload: Dict[str, Any] = {}
        if len(image_paths) >= 1:
            optional_payload["front_path"] = image_paths[0]
        if len(image_paths) >= 2:
            optional_payload["back_path"] = image_paths[1]
        if advisories is not None:
            optional_payload["advisories"] = advisories
        if category:
            optional_payload["category"] = category
        # `is not None` (not truthiness): 0.0 is a valid coordinate — the
        # equator and the prime meridian both read 0.
        if latitude is not None:
            optional_payload["latitude"] = latitude
        if longitude is not None:
            optional_payload["longitude"] = longitude
        if location_accuracy is not None:
            optional_payload["location_accuracy"] = location_accuracy

        logger.info(
            f"Saving scan record with {len(image_paths)} image(s) and status='{status}'"
        )

        # Insert, dropping any optional column this project's schema does not have
        # yet. Only the named column is dropped, so a missing `advisories` cannot
        # cost the record its `category`.
        payload = {**core_payload, **optional_payload}
        for _ in range(len(optional_payload) + 1):
            try:
                response = self.client.table("scans").insert(payload).execute()
                if response.data and len(response.data) > 0:
                    return response.data[0]
                return payload
            except Exception as exc:
                err_msg = str(exc)
                if "PGRST204" not in err_msg and "column" not in err_msg.lower():
                    logger.error(f"Error inserting scan record into Supabase: {exc}")
                    raise
                missing = next(
                    (key for key in optional_payload if key in payload and key in err_msg), None
                )
                if not missing:
                    logger.warning(
                        f"Unrecognised column error inserting scan record ({err_msg}). "
                        "Retrying with the core columns only."
                    )
                    payload = dict(core_payload)
                    continue
                logger.warning(
                    f"Column '{missing}' is missing from the 'scans' table; dropping it and "
                    "retrying. Re-run supabase/schema.sql to persist it."
                )
                payload.pop(missing, None)

        response = self.client.table("scans").insert(core_payload).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return core_payload
