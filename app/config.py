from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/metering"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    smtp_url: str = ""
    alert_from_email: str = "no-reply@localhost"
    app_base_url: str = "http://localhost:8000"
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_pro_price_id: str = ""

    # Plans + quotas (documented, Phase 1)
    free_api_limit: int = 1000
    free_token_limit: int = 100000
    pro_api_limit: int = 10000
    pro_token_limit: int = 1000000

    # Pricing v1, integer cents per 1K tokens (pinned constants)
    pricing_version: int = 1
    input_per_1k_cents: int = 15
    cached_input_per_1k_cents: int = 4
    output_per_1k_cents: int = 60  # reasoning tokens priced here too
    api_call_cents: int = 1


settings = Settings()
