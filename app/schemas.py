from typing import Literal

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    type: Literal["api_call", "ai_tokens"] = Field(description="usage type being metered")
    qty: int = Field(default=1, ge=1, le=1_000_000, description="units for api_call; must be 1 per request")
    input_tokens: int = Field(default=0, ge=0, le=10_000_000)
    cached_input_tokens: int = Field(default=0, ge=0, le=10_000_000)
    output_tokens: int = Field(default=0, ge=0, le=10_000_000)
    reasoning_tokens: int = Field(default=0, ge=0, le=10_000_000)


class UsageSection(BaseModel):
    used: int
    limit: int


class UsageResponse(BaseModel):
    tenant_id: str
    plan: str
    period: str
    api: UsageSection
    tokens: UsageSection
    cost_cents: int
    pricing_version: int


class ErrorResponse(BaseModel):
    detail: str
    used: int | None = None
    limit: int | None = None
