"""PricingService: integer-only money math. Reasoning tokens price as output."""

from app.config import settings


def token_cost_cents(
    input_tokens: int,
    cached_input_tokens: int,
    output_tokens: int,
    reasoning_tokens: int,
) -> int:
    weighted = (
        input_tokens * settings.input_per_1k_cents
        + cached_input_tokens * settings.cached_input_per_1k_cents
        + (output_tokens + reasoning_tokens) * settings.output_per_1k_cents
    )
    return (weighted + 500) // 1000  # round half-up to cents


def api_cost_cents(qty: int) -> int:
    return qty * settings.api_call_cents


def event_cost_cents(
    usage_type: str,
    qty: int,
    input_tokens: int = 0,
    cached_input_tokens: int = 0,
    output_tokens: int = 0,
    reasoning_tokens: int = 0,
) -> int:
    if usage_type == "api_call":
        return api_cost_cents(qty)
    return token_cost_cents(input_tokens, cached_input_tokens, output_tokens, reasoning_tokens)
