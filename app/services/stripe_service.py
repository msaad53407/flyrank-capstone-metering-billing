"""StripeService: Checkout sessions in test mode. No real money, ever."""

import stripe

from app.config import settings


def _client() -> stripe:
    stripe.api_key = settings.stripe_secret_key
    return stripe


def create_checkout_session(tenant) -> dict:
    """Create a subscription Checkout Session for a tenant upgrade.

    Tenant identity travels in metadata + client_reference_id so the
    checkout.session.completed webhook can attribute it without API reads.
    """
    _client()
    kwargs: dict = {
        "mode": "subscription",
        "line_items": [{"price": settings.stripe_pro_price_id, "quantity": 1}],
        "success_url": f"{settings.app_base_url}/demo/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{settings.app_base_url}/demo/billing",
        "client_reference_id": tenant.id,
        "metadata": {"tenant_id": tenant.id},
    }
    if tenant.stripe_customer_id:
        kwargs["customer"] = tenant.stripe_customer_id
    elif tenant.contact_email:
        kwargs["customer_email"] = tenant.contact_email
    session = stripe.checkout.Session.create(**kwargs)
    return {"url": session.url, "session_id": session.id}
