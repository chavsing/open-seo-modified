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

// Same day `months` later, clamped to that month's last day (Jan 31 + 1 ->
// Feb 28). Paid periods and yearly credit refills both count months this way.
export function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/**
 * Whether an org's plan grants the paid features. Any plan other than free
 * counts. A plan with a paid period (Pro) lasts until that period ends, plus
 * the grace above; one without (Lifetime) lasts until it is canceled.
 */
/** When a plan with a paid period stops granting access: its end plus the
 *  grace days. Null for plans without a period (Lifetime, free). */
export function paidAccessEndsAt(row: PlanRow | null) {
  if (!row?.currentPeriodEnd) return null;
  return new Date(
    Date.parse(row.currentPeriodEnd) + RENEWAL_GRACE_MS,
  ).toISOString();
}

/** Paid periods that ended before this time have run out of grace too. */
export function lapsedPeriodCutoff(now: Date) {
  return new Date(now.getTime() - RENEWAL_GRACE_MS).toISOString();
}

export function hasPaidAccess(row: PlanRow | null, now = new Date()) {
  if (!row || row.planId === FREE_PLAN_ID) return false;
  if (row.currentPeriodEnd === null) return row.planStatus !== "canceled";
  return Date.parse(row.currentPeriodEnd) + RENEWAL_GRACE_MS > now.getTime();
}
