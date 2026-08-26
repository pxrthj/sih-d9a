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

    def get_mime_type(self, storage_path: str) -> str:
        """Guesses MIME type from file extension, default to image/jpeg."""
        mime_type, _ = mimetypes.guess_type(storage_path)
        if not mime_type or not mime_type.startswith("image/"):
            return "image/jpeg"
        return mime_type

    def fetch_scan(self, scan_id: str) -> Optional[Dict[str, Any]]:
        """Read a single scan record by id (read-only; used for report generation)."""
        response = self.client.table("scans").select("*").eq("id", scan_id).limit(1).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None

    def fetch_profile(self, user_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """Read a profile (name/email) by auth id, for officer attribution. Read-only."""
        if not user_id:
            return None
        response = (
            self.client.table("profiles")
            .select("full_name, email")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None

    def save_scan_record(
        self,
        front_path: str,
        back_path: str,
        extracted: Dict[str, Any],
        violations: List[Dict[str, Any]],
        status: str,
        user_id: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Inserts a row into the Supabase 'scans' table storing front_path, back_path,
        extracted data, violations, and status.

        Args:
            front_path: Storage path of the front image.
            back_path: Storage path of the back image.
            extracted: Dict representation of extracted label data.
            violations: List of violation dicts.
            status: Overall compliance status string.

        Returns:
            Dict[str, Any]: Inserted database record.
        """
        combined_storage_path = f"{front_path} | {back_path}"
        full_payload = {
            "front_path": front_path,
            "back_path": back_path,
            "storage_path": combined_storage_path,
            "extracted": extracted,
            "violations": violations,
            "status": status,
        }
        if user_id:
            full_payload["user_id"] = user_id
        if category:
            full_payload["category"] = category

        logger.info(
            f"Saving scan record to 'scans' table for front='{front_path}', "
            f"back='{back_path}' with status='{status}'"
        )

        try:
            # First attempt inserting with dedicated front_path and back_path columns
            response = self.client.table("scans").insert(full_payload).execute()
            if response.data and len(response.data) > 0:
                return response.data[0]
            return full_payload
        except Exception as exc:
            err_msg = str(exc)
            # Fallback if front_path / back_path columns are not yet added in the Supabase schema
            if "PGRST204" in err_msg or "column" in err_msg.lower():
                logger.warning(
                    "Columns 'front_path'/'back_path' not found in 'scans' table schema cache. "
                    "Falling back to 'storage_path' column."
                )
                fallback_payload = {
                    "storage_path": combined_storage_path,
                    "extracted": extracted,
                    "violations": violations,
                    "status": status,
                }
                if user_id:
                    fallback_payload["user_id"] = user_id
                if category:
                    fallback_payload["category"] = category
                response = self.client.table("scans").insert(fallback_payload).execute()
                if response.data and len(response.data) > 0:
                    return response.data[0]
                return fallback_payload
            logger.error(f"Error inserting scan record into Supabase: {exc}")
            raise
