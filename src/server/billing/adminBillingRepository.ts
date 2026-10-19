import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  billingAccounts,
  billingAdminActions,
  creditBalances,
  member,
  organization,
  user,
} from "@/db/schema";
import {
  balanceRow,
  ensureBillingAccount,
  getBillingAccountRow,
  type CreditPool,
} from "@/server/billing/creditLedger";
import {
  AUTUMN_LIFETIME_PLAN_ID,
  AUTUMN_PRO_PLAN_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  LIFETIME_CREDITS,
  PRO_MONTHLY_CREDITS,
} from "@/shared/billing";

// Plan changes and credit grants the client makes from the admin page after
// a PayPal payment. Like the ledger, each change is one atomic runBatch.

/**
 * Members whose email contains `query`, with their org's plan and balances,
 * for the admin page. Orgs billing has never touched show no plan row.
 */
export async function searchBillingAccounts(query: string) {
  const pattern = `%${query
    .trim()
    .toLowerCase()
    .replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const members = await db
    .select({
      organizationId: member.organizationId,
      organizationName: organization.name,
      email: user.email,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(sql`lower(${user.email}) like ${pattern} escape '\\'`)
    .orderBy(asc(user.email))
    .limit(25);
  const orgIds = [...new Set(members.map((m) => m.organizationId))];
  if (orgIds.length === 0) return [];

  const [accounts, balances] = await Promise.all([
    db
      .select()
      .from(billingAccounts)
      .where(inArray(billingAccounts.organizationId, orgIds)),
    db
      .select()
      .from(creditBalances)
      .where(inArray(creditBalances.organizationId, orgIds)),
  ]);
  return members.map((m) => {
    const pool = (id: CreditPool) =>
      balances.find(
        (b) => b.organizationId === m.organizationId && b.pool === id,
      );
    return {
      ...m,
      account:
        accounts.find((a) => a.organizationId === m.organizationId) ?? null,
      monthly: pool(AUTUMN_SEO_DATA_BALANCE_FEATURE_ID) ?? null,
      topup: pool(AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID) ?? null,
    };
  });
}

export type AdminBillingAction =
  | { action: "pro_month" }
  | { action: "lifetime" }
  | { action: "add_credits"; credits: number }
  | { action: "downgrade" };

// Same day next month, clamped to the month's last day (Jan 31 -> Feb 28).
function addOneMonth(date: Date) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/**
 * Applies an admin's plan change or credit grant, and logs it, in one batch.
 * The log row's id is the request id, so a repeated request fails on the
 * primary key and changes nothing: `applied` is then false.
 *
 * - pro_month: one more paid month of Pro, counted from the current paid
 *   period's end while it lasts, else from now; monthly credits refill.
 * - lifetime: Lifetime access; its credits are added to what is left.
 * - add_credits: adds extra credits, which never expire.
 * - downgrade: back to free, with no credits left (refunds and cancellations).
 */
export async function applyAdminBillingAction(args: {
  requestId: string;
  organizationId: string;
  adminEmail: string;
  change: AdminBillingAction;
  now?: Date;
}): Promise<{ applied: boolean }> {
  const { requestId, organizationId, adminEmail, change } = args;
  const now = args.now ?? new Date();
  const nowIso = now.toISOString();
  await ensureBillingAccount(organizationId);
  const account = await getBillingAccountRow(organizationId);

  const accountRow = eq(billingAccounts.organizationId, organizationId);
  const monthlyRow = balanceRow(
    organizationId,
    AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  );
  const topupRow = balanceRow(
    organizationId,
    AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  );
  const remaining = creditBalances.remaining;

  let periodEnd: string | null = null;
  if (change.action === "pro_month") {
    const paidUntil =
      account?.planId === AUTUMN_PRO_PLAN_ID && account.currentPeriodEnd
        ? new Date(account.currentPeriodEnd)
        : null;
    const from = paidUntil && paidUntil > now ? paidUntil : now;
    periodEnd = addOneMonth(from).toISOString();
  }

  try {
    await runBatch((tx) => {
      const log = tx.insert(billingAdminActions).values({
        id: requestId,
        organizationId,
        action: change.action,
        credits: change.action === "add_credits" ? change.credits : null,
        adminEmail,
        createdAt: nowIso,
      });
      switch (change.action) {
        case "pro_month":
          return [
            log,
            tx
              .update(billingAccounts)
              .set({
                planId: AUTUMN_PRO_PLAN_ID,
                planStatus: "active",
                currentPeriodEnd: periodEnd,
                canceledAt: null,
                updatedAt: nowIso,
              })
              .where(accountRow),
            tx
              .update(creditBalances)
              .set({
                granted: PRO_MONTHLY_CREDITS,
                remaining: PRO_MONTHLY_CREDITS,
                nextResetAt: periodEnd,
              })
              .where(monthlyRow),
          ];
        case "lifetime":
          return [
            log,
            tx
              .update(billingAccounts)
              .set({
                planId: AUTUMN_LIFETIME_PLAN_ID,
                planStatus: "active",
                currentPeriodEnd: null,
                canceledAt: null,
                updatedAt: nowIso,
              })
              .where(accountRow),
            tx
              .update(creditBalances)
              .set({
                granted: LIFETIME_CREDITS,
                remaining: sql`${remaining} + ${LIFETIME_CREDITS}`,
                nextResetAt: null,
              })
              .where(monthlyRow),
          ];
        case "add_credits":
          return [
            log,
            tx
              .update(creditBalances)
              .set({
                granted: sql`${creditBalances.granted} + ${change.credits}`,
                remaining: sql`${remaining} + ${change.credits}`,
              })
              .where(topupRow),
          ];
        case "downgrade":
          return [
            log,
            tx
              .update(billingAccounts)
              .set({
                planId: "free",
                planStatus: "active",
                currentPeriodEnd: null,
                canceledAt: nowIso,
                updatedAt: nowIso,
              })
              .where(accountRow),
            tx
              .update(creditBalances)
              .set({ granted: 0, remaining: 0, nextResetAt: null })
              .where(eq(creditBalances.organizationId, organizationId)),
          ];
      }
    });
  } catch (error) {
    const [logged] = await db
      .select({ id: billingAdminActions.id })
      .from(billingAdminActions)
      .where(eq(billingAdminActions.id, requestId))
      .limit(1);
    if (logged) return { applied: false };
    throw error;
  }
  return { applied: true };
}
