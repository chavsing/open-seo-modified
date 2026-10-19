import type { Autumn } from "autumn-js";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

let autumnPromise: Promise<Autumn> | undefined;

// Lazy: keeps the ~450 kB autumn-js SDK out of the eager isolate startup
// graph (self-hosted deployments never load it at all); resolves instantly
// after the first call.
function loadAutumn(): Promise<Autumn> {
  return (autumnPromise ??= import("autumn-js").then(
    ({ Autumn }) =>
      new Autumn({
        secretKey: () => getRequiredEnvValue("AUTUMN_SECRET_KEY"),
        // Without this client-wide value the SDK aborts check/track after
        // 5s; a per-call timeoutMs cannot raise it. A timed-out call fails
        // open: track then never charges the usage, and check returns no
        // balance.
        timeoutMs: 10_000,
        // Retries 429/500/502/503/504 (per-operation retryCodes) plus
        // connection errors. Cloudflare 52x statuses are not in the SDK's
        // retry list, so those still surface immediately.
        //
        // These reads/gates (customers.getOrCreate, check) sit on the request
        // hot path, so keep the total retry window short: when Autumn is
        // rate-limiting or slow, an 8s backoff window held the isolate open
        // for seconds on every request and cascaded into region-wide
        // congestion (incident 2026-07-06). Fail fast instead — a caller that
        // can't gate surfaces an error rather than hanging.
        retryConfig: {
          strategy: "backoff",
          backoff: {
            initialInterval: 250,
            maxInterval: 1000,
            exponent: 1.5,
            maxElapsedTime: 2500,
          },
          retryConnectionErrors: true,
        },
      }),
  ));
}

/** Shape-preserving lazy facade over the SDK client: call sites keep the
 *  plain `autumn.customers.get(...)` form. Covers only the methods we use — add a
 *  line here when adopting a new one. */
export const autumn = {
  customers: {
    getOrCreate: (...args: Parameters<Autumn["customers"]["getOrCreate"]>) =>
      loadAutumn().then((client) => client.customers.getOrCreate(...args)),
    get: (...args: Parameters<Autumn["customers"]["get"]>) =>
      loadAutumn().then((client) => client.customers.get(...args)),
    update: (...args: Parameters<Autumn["customers"]["update"]>) =>
      loadAutumn().then((client) => client.customers.update(...args)),
  },
  invoices: {
    list: (...args: Parameters<Autumn["invoices"]["list"]>) =>
      loadAutumn().then((client) => client.invoices.list(...args)),
  },
  billing: {
    attach: (...args: Parameters<Autumn["billing"]["attach"]>) =>
      loadAutumn().then((client) => client.billing.attach(...args)),
    openCustomerPortal: (
      ...args: Parameters<Autumn["billing"]["openCustomerPortal"]>
    ) =>
      loadAutumn().then((client) => client.billing.openCustomerPortal(...args)),
  },
};
