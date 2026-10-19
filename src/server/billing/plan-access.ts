// Leaf module (no runtime imports) so the access rule is unit-testable.

const FREE_PLAN_ID = "free";

// Each Pro month is recorded by hand from the admin page after PayPal charges
// it, so access outlasts the paid period by a few days while the client
// records the next payment.
const RENEWAL_GRACE_MS = 3 * 24 * 60 * 60_000;

type PlanRow = {
  planId: string;
  planStatus: "active" | "past_due" | "canceled";
  currentPeriodEnd: string | null;
};

/**
 * Whether an org's plan grants the paid features. Any plan other than free
 * counts. A plan with a paid period (Pro) lasts until that period ends, plus
 * the grace above; one without (Lifetime) lasts until it is canceled.
 */
export function hasPaidAccess(row: PlanRow | null, now = new Date()) {
  if (!row || row.planId === FREE_PLAN_ID) return false;
  if (row.currentPeriodEnd === null) return row.planStatus !== "canceled";
  return Date.parse(row.currentPeriodEnd) + RENEWAL_GRACE_MS > now.getTime();
}
