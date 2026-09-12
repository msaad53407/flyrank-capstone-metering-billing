export type UsageType = "api_call" | "ai_tokens";

export interface UsageSection {
  used: number;
  limit: number;
}

export interface UsageResponse {
  tenant_id: string;
  plan: string;
  period: string;
  api: UsageSection;
  tokens: UsageSection;
  cost_cents: number;
  pricing_version: number;
}

export interface GenerateBody {
  type: UsageType;
  qty: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
}

export interface ApiResult {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface TenantInfo {
  id: string;
  name: string;
  email: string;
  plan_id: string;
  status: string;
}

export interface AuthResult {
  access_token: string;
  token_type: string;
  tenant: TenantInfo;
}

export const DEMO_TENANT = "00000000-0000-0000-0000-000000000001";
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "demo123";

const AUTH_TOKEN_KEY = "flyrank_auth_token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `key-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

async function toResult(res: Response): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    headers[key] = value;
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    try {
      body = await res.text();
    } catch {
      body = null;
    }
  }
  return { status: res.status, body, headers };
}

export async function postRegister(name: string, email: string, password: string): Promise<ApiResult> {
  const res = await fetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return toResult(res);
}

export async function postLogin(email: string, password: string): Promise<ApiResult> {
  const res = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return toResult(res);
}

export async function postDemoLogin(): Promise<ApiResult> {
  const res = await fetch("/auth/demo-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  return toResult(res);
}

export async function fetchMe(): Promise<TenantInfo> {
  const res = await fetch("/auth/me", {
    headers: { ...authHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as TenantInfo;
}

export async function postGenerate(
  tenantId: string,
  key: string,
  body: GenerateBody,
): Promise<ApiResult> {
  const res = await fetch("/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": tenantId,
      "Idempotency-Key": key,
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });
  return toResult(res);
}

export async function fetchUsage(tenantId: string): Promise<UsageResponse> {
  const res = await fetch(`/usage?tenant_id=${encodeURIComponent(tenantId)}`, {
    headers: {
      ...authHeaders(),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as UsageResponse;
}

export async function postCheckout(tenantId: string): Promise<ApiResult> {
  const res = await fetch("/billing/checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify({ tenant_id: tenantId }),
  });
  return toResult(res);
}

export async function postWebhookEvent(raw: string, signature: string): Promise<ApiResult> {
  const res = await fetch("/webhooks/stripe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": signature,
      ...authHeaders(),
    },
    body: raw,
  });
  return toResult(res);
}

/** Stripe-style test signature (test playground only — never ship a real whsec_ here). */
export async function signWebhook(secret: string, raw: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const ts = Math.floor(Date.now() / 1000);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${raw}`));
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${ts},v1=${hex}`;
}

/** Mirrors app/services/pricing.py (pinned v1: 15 / 4 / 60 per 1K, reasoning = output). */
export function tokenCostCents(
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  reasoningTokens: number,
): number {
  const weighted =
    inputTokens * 15 + cachedInputTokens * 4 + (outputTokens + reasoningTokens) * 60;
  return Math.floor((weighted + 500) / 1000);
}
