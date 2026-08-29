import os
from functools import lru_cache
from pathlib import Path
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Locate backend/.env
BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"

# Load environment variables from backend/.env if present, otherwise system env
if ENV_FILE.exists():
    load_dotenv(dotenv_path=ENV_FILE)
else:
    load_dotenv()


def _parse_cors_origins() -> List[str]:
    """Read allowed CORS origins from the CORS_ORIGINS env var (comma-separated).

    In production set e.g. CORS_ORIGINS=https://your-app.vercel.app
    (multiple origins allowed, comma-separated). Falls back to local dev URLs.
    """
    raw = os.getenv("CORS_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return ["http://localhost:5173", "http://127.0.0.1:5173"]


class Settings(BaseModel):
    SUPABASE_URL: str = Field(default_factory=lambda: os.getenv("SUPABASE_URL", ""))
    SUPABASE_SERVICE_ROLE_KEY: str = Field(default_factory=lambda: os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
    GEMINI_API_KEY: str = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    # Flash rather than Flash-Lite: the small, low-contrast ink-jet MRP/batch
    # blocks on real packaging are exactly where the lite tier loses text.
    # Set GEMINI_MODEL to override (e.g. back to gemini-3.5-flash-lite for cost).
    GEMINI_MODEL: str = Field(
        default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    )
    # Public base URL of the frontend, used to build the verification link
    # printed on each notice. Set to the deployed origin in production.
    APP_BASE_URL: str = Field(
        default_factory=lambda: os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")
    )
    STORAGE_BUCKET: str = Field(default="evidence-photos")
    CORS_ORIGINS: List[str] = Field(default_factory=_parse_cors_origins)

    def validate_keys(self) -> None:
        missing = []
        if not self.SUPABASE_URL:
            missing.append("SUPABASE_URL")
        if not self.SUPABASE_SERVICE_ROLE_KEY:
            missing.append("SUPABASE_SERVICE_ROLE_KEY")
        if not self.GEMINI_API_KEY:
            missing.append("GEMINI_API_KEY")
        if missing:
            raise ValueError(f"Missing required environment variables in .env: {', '.join(missing)}")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    # Cached: settings are static per process, so this reads the environment and
    # re-validates the keys once instead of on every request (it is a FastAPI
    # dependency on every endpoint). Tests override the dependency, so the cache
    # does not get in their way.
    settings = Settings()
    settings.validate_keys()
    return settings
