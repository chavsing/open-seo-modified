import { env, waitUntil } from "cloudflare:workers";
import { parseCookies } from "better-auth/cookies";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { captureServerError } from "@/server/lib/posthog";

// Dub referral attribution (hosted only). Flow:
//  1. links.openseo.so/<partner> redirects to openseo.so/?dub_id=<clickId>;
//     the marketing site persists it as a `dub_id` cookie on `.openseo.so`.
//  2. On signup we send a Dub lead and pin `referred-user:<userId>` in KV.
//     The lead creates a pseudonymous Dub customer record (random name +
//     our user id) — GDPR erasure deletes the KV pins here and the Dub-side
//     record via the erasure runbook.
//  3. The pin is copied to `referred-org:<orgId>` on every session.
//  4. Sales are not reported to Dub: customers pay through PayPal links
//     outside the app, so there is no in-app payment event to send.
// Every entry point no-ops without DUB_API_KEY, so self-host and previews
// are inert.

const DUB_API_URL = "https://api.dub.co";
const DUB_COOKIE_NAME = "dub_id";
export const DUB_REFERRED_USER_KV_PREFIX = "dub:referred-user:";
export const DUB_REFERRED_ORG_KV_PREFIX = "dub:referred-org:";
// User pin: matches Dub's 90-day attribution cookie. Org pin: refreshed on
// every session while the user pin lives, then ages out.
const USER_PIN_TTL_SECONDS = 90 * 24 * 60 * 60;
const ORG_PIN_TTL_SECONDS = 400 * 24 * 60 * 60;

function getDubApiKey() {
  const value: unknown = Reflect.get(env, "DUB_API_KEY");
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || null;
}

async function postDub(apiKey: string, path: string, body: unknown) {
  return fetch(`${DUB_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

/** Records a Dub lead and pins the referral in KV when the signup request
 *  carries a `dub_id` cookie. Must never fail the signup. */
export async function captureDubReferralSignup(
  userId: string,
  request: Request | null | undefined,
) {
  const apiKey = getDubApiKey();
  const cookieHeader = request?.headers.get("cookie");
  if (!apiKey || !cookieHeader) return;

  try {
    const clickId = parseCookies(cookieHeader).get(DUB_COOKIE_NAME)?.trim();
    if (!clickId) return;

    await env.KV.put(`${DUB_REFERRED_USER_KV_PREFIX}${userId}`, clickId, {
      expirationTtl: USER_PIN_TTL_SECONDS,
    });

    waitUntil(
      (async () => {
        // One retry: leads dedupe Dub-side on customerExternalId+eventName,
        // and a lost lead leaves the org's sales unattributable. mode "wait"
        // materializes the customer before a near-immediate checkout's sale.
        let lastError: unknown;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            const response = await postDub(apiKey, "/track/lead", {
              clickId,
              eventName: "Sign up",
              mode: "wait",
              // Deliberately no name/email: keeps the Dub record pseudonymous.
              customerExternalId: userId,
            });
            if (response.ok) return;
            lastError = new Error(
              `Dub lead tracking failed (${response.status})`,
            );
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError;
      })().catch(async (error: unknown) => {
        console.error("Dub lead tracking failed", { userId, error });
        await captureServerError(error, {
          source: "dub_lead",
          user_id: userId,
        });
      }),
    );
  } catch (error) {
    console.error("Dub referral capture failed", { userId, error });
  }
}

/** Copies a user's referral pin onto the organization they FOUNDED, keyed by
 *  org id (= Autumn customer id) so billing events resolve it directly.
 *  Founded, not merely owned or joined: commission is only for net-new users
 *  creating their own workspace — an invitee (even one later promoted to
 *  owner) must never attribute an existing org's revenue to their referrer.
 *  Called on every session (only touches the DB when a user pin exists);
 *  must never fail session creation. */
export async function markDubReferredOrganization(userId: string) {
  if (!getDubApiKey()) return;

  try {
    const clickId = await env.KV.get(`${DUB_REFERRED_USER_KV_PREFIX}${userId}`);
    if (!clickId) return;

    const organizationId =
      await AuthRepository.findFirstFoundedOrganizationIdForUser(userId);
    if (!organizationId) return;

    await env.KV.put(`${DUB_REFERRED_ORG_KV_PREFIX}${organizationId}`, userId, {
      expirationTtl: ORG_PIN_TTL_SECONDS,
    });
  } catch (error) {
    console.error("Dub referred-org marking failed", { userId, error });
  }
}
