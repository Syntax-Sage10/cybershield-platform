from typing import Literal

from pydantic import BaseModel, Field


class PortScanParams(BaseModel):
    target: str = Field(pattern=r"^[A-Za-z0-9._:%\-]{1,255}$")
    ports: str = Field(default="1-1024", pattern=r"^[0-9,\- ]{1,200}$")
    mode: Literal["connect", "syn"] = "connect"
    concurrency: int = Field(default=200, ge=1, le=1000)
    timeout: float = Field(default=1.0, ge=0.1, le=10)
    grab_banner: bool = True


class FimParams(BaseModel):
    path: str = Field(min_length=1, max_length=1024)


class JobCreate(BaseModel):
    agent_id: str = Field(min_length=1, max_length=64)
    kind: Literal["port_scan", "fim"]
    params: dict = Field(default_factory=dict)
