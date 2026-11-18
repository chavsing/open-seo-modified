import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { PAYPAL_CLIENT_ID } from "@/shared/billing";

// PayPal's REST API, as the client's live PayPal app. The secret is
// PAYPAL_CLIENT_SECRET; the client ID is the public one the buttons use.
const PAYPAL_API = "https://api-m.paypal.com";

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number(),
});

// One token per Worker isolate, renewed a minute before PayPal expires it.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const secret = await getOptionalEnvValue("PAYPAL_CLIENT_SECRET");
  if (!secret) {
    throw new AppError("INTERNAL_ERROR", "PAYPAL_CLIENT_SECRET is not set");
  }
  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${secret}`)}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `PayPal token request failed with ${response.status}`,
    );
  }
  const token = tokenSchema.parse(await response.json());
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  return token.access_token;
}

/**
 * One PayPal API call. Returns the status and the parsed body (null when
 * empty or not JSON) so callers can read PayPal's error details, which
 * matter for declined cards and already-captured orders.
 */
export async function paypalRequest(
  path: string,
  init: { method?: "GET" | "POST"; body?: string; requestId?: string } = {},
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${await getAccessToken()}`,
    "content-type": "application/json",
    // The full order or capture back, not just its id and status.
    prefer: "return=representation",
  };
  // PayPal-Request-Id makes a repeated POST return the first result
  // instead of acting twice.
  if (init.requestId) headers["paypal-request-id"] = init.requestId;
  const response = await fetch(`${PAYPAL_API}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { ok: response.ok, status: response.status, body };
}
