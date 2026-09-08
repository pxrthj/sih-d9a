import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.api.scans import router as scans_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("legal_metrology_backend")

settings = get_settings()

# Say out loud which database this process will write to. Development and
# production are separate Supabase projects selected by a gitignored .env, so
# without this line the two are indistinguishable from the terminal -- and the
# scans table is immutable, which makes a write to the wrong one unfixable.
logger.info(
    f"Supabase project: {settings.project_ref()} | "
    f"bucket: {settings.STORAGE_BUCKET} | notice QR base: {settings.APP_BASE_URL}"
)

app = FastAPI(
    title="Legal Metrology Label Compliance Checker API",
    description="Backend service for automated Legal Metrology label extraction and rule compliance auditing.",
    version="1.0.0",
)

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    # So the frontend can use the filename the server chose for the notice
    # instead of inventing its own.
    expose_headers=["Content-Disposition"],
)

# Register API routers
app.include_router(scans_router)


@app.get("/health", tags=["system"], summary="Health check endpoint")
def health_check():
    return {
        "status": "healthy",
        "service": "legal-metrology-backend",
        "gemini_model": settings.GEMINI_MODEL,
        "storage_bucket": settings.STORAGE_BUCKET,
        # So a deployed instance can be checked for which database it is on
        # without opening a dashboard. Public information: this is the Supabase
        # URL the browser bundle already carries.
        "supabase_project": settings.project_ref(),
    }


@app.get("/", tags=["system"], include_in_schema=False)
def root():
    return {
        "message": "Legal Metrology Compliance API is running",
        "docs": "/docs",
        "health": "/health",
        "endpoint": "POST /api/scans",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
