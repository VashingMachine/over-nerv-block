from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.contracts import HealthResponse, VersionResponse

settings = get_settings()

app = FastAPI(
    title="Over Nerv Block API",
    version=settings.version,
    docs_url=None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.allowed_origins),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept", "Content-Type"],
)


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        environment=settings.environment,
        version=settings.version,
        commit=settings.commit,
    )


@app.get("/api/version", response_model=VersionResponse)
def version() -> VersionResponse:
    return VersionResponse(
        version=settings.version,
        environment=settings.environment,
        commit=settings.commit,
    )
