import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    environment: str
    version: str
    commit: str
    allowed_origins: tuple[str, ...]


def _allowed_origins(raw_value: str) -> tuple[str, ...]:
    return tuple(origin.strip() for origin in raw_value.split(",") if origin.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings(
        environment=os.getenv("APP_ENV", "local"),
        version=os.getenv("APP_VERSION", "0.1.0"),
        commit=os.getenv("APP_COMMIT", "development"),
        allowed_origins=_allowed_origins(
            os.getenv(
                "ALLOWED_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:4173",
            )
        ),
    )
