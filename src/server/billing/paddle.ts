import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  PADDLE_PRICE_IDS,
  type PaddleEnvironment,
  type PaddleProduct,
} from "@/shared/billing";

// The client's Paddle account. Paddle checkout is on once PADDLE_CLIENT_TOKEN
// (public, for Paddle.js) and PADDLE_WEBHOOK_SECRET (the notification
// destination's secret) are set and the environment has prices; until then
// the billing pages keep selling through PayPal. PADDLE_API_KEY is only for
// the customer's billing portal link and the payer email on unmatched
// payments. PADDLE_ENVIRONMENT=sandbox switches everything to Paddle's
// sandbox.

export type PaddleConfig = {
  environment: PaddleEnvironment;
  clientToken: string;
  priceIds: Record<PaddleProduct, string>;
};

const PADDLE_PRODUCTS: PaddleProduct[] = [
  "pro_month",
  "pro_year",
  "lifetime",
  "credit_pack",
];

async function getEnvironment(): Promise<PaddleEnvironment> {
  return (await getOptionalEnvValue("PADDLE_ENVIRONMENT")) === "sandbox"
    ? "sandbox"
    : "production";
}

/** What the browser needs to open Paddle checkout. Null while Paddle is off. */
export async function getPaddleCheckoutConfig(): Promise<PaddleConfig | null> {
  const environment = await getEnvironment();
  const [clientToken, webhookSecret] = await Promise.all([
    getOptionalEnvValue("PADDLE_CLIENT_TOKEN"),
    getOptionalEnvValue("PADDLE_WEBHOOK_SECRET"),
  ]);
  const priceIds = PADDLE_PRICE_IDS[environment];
  // Without the webhook secret a payment could never turn the plan on.
  if (!clientToken || !webhookSecret || !priceIds) return null;
  return { environment, clientToken, priceIds };
}

/** The product a Paddle price sells, in the active environment. */
export async function productForPaddlePrice(
  priceId: string,
): Promise<PaddleProduct | null> {
  const priceIds = PADDLE_PRICE_IDS[await getEnvironment()];
  return (
    PADDLE_PRODUCTS.find((product) => priceIds?.[product] === priceId) ?? null
  );
}

// Paddle signs each notification as "ts=<unix seconds>;h1=<hex HMAC>", the
// HMAC-SHA256 of "<ts>:<raw body>" under the destination's secret. A wide
// window allows for clock drift; replays are harmless anyway, since every
// payment applies once.
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

export async function isGenuinePaddleSignature(
  header: string | null,
  rawBody: string,
  secret: string,
  now = Date.now(),
) {
  if (!header) return false;
  const parts = header.split(";").map((part) => part.split("="));
  const ts = parts.find(([key]) => key === "ts")?.[1];
  const signatures = parts.flatMap(([key, value]) =>
    key === "h1" && value ? [value] : [],
  );
  if (!ts || !/^\d+$/.test(ts) || signatures.length === 0) return false;
  if (Math.abs(now / 1000 - Number(ts)) > SIGNATURE_MAX_AGE_SECONDS) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = new TextEncoder().encode(`${ts}:${rawBody}`);
  for (const signature of signatures) {
    const bytes = hexToBytes(signature);
    // crypto.subtle.verify compares in constant time.
    if (bytes && (await crypto.subtle.verify("HMAC", key, bytes, signed))) {
      return true;
    }
  }
  return false;
}

function hexToBytes(hex: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * One Paddle API call, or null when PADDLE_API_KEY isn't set. Returns the
 * status and parsed body (null when empty or not JSON).
 */
export async function paddleRequest(
  path: string,
  init: { method?: "GET" | "POST"; body?: string } = {},
) {
  const apiKey = await getOptionalEnvValue("PADDLE_API_KEY");
  if (!apiKey) return null;
  const base =
    (await getEnvironment()) === "sandbox"
      ? "https://sandbox-api.paddle.com"
      : "https://api.paddle.com";
  const response = await fetch(`${base}${path}`, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: init.body,
    signal: AbortSignal.timeout(15_000),
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
