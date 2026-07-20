from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["api"] = "api"
    environment: str
    version: str
    commit: str


class VersionResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Literal["over-nerv-block-api"] = "over-nerv-block-api"
    version: str
    environment: str
    commit: str
    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
