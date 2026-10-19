// Leaf module (no runtime imports) so the access rule is unit-testable.

const FREE_PLAN_ID = "free";

type PlanRow = {
  planId: string;
  planStatus: "active" | "past_due" | "canceled";
  currentPeriodEnd: string | null;
};

/**
 * Whether an org's plan grants the paid features. Any plan other than free
 * counts, including ones granted by hand. Past due keeps access while the
 * payment is retried; a canceled plan keeps it until the paid period ends.
 */
export function hasPaidAccess(row: PlanRow | null, now = new Date()) {
  if (!row || row.planId === FREE_PLAN_ID) return false;
  if (row.planStatus === "canceled") {
    return (
      row.currentPeriodEnd !== null && row.currentPeriodEnd > now.toISOString()
    );
  }
  return true;
}
