import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { billingAccounts, billingNotices, creditBalances } from "@/db/schema";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import type { AdminBillingAction } from "@/server/billing/adminBillingRepository";
import { getBillingAccountRow } from "@/server/billing/creditLedger";
import { hasPaidAccess, paidAccessEndsAt } from "@/server/billing/plan-access";
import { sendNoticeEmail } from "@/server/email/loops";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  AUTUMN_PRO_YEARLY_PLAN_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";

// Billing emails to the customer: "your plan is on" after the admin records a
// payment, and a daily run for a Pro year that is ending and for credits that
// are running low. Every email is best effort; billing never waits on it.

const DAY_MS = 24 * 60 * 60_000;
// Under this much left on a paid plan, the owners are told once per period.
const LOW_CREDITS = 5 * AUTUMN_SEO_DATA_CREDITS_PER_USD;

type NoticeKind = (typeof billingNotices.$inferInsert)["kind"];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const formatUsd = (credits: number) =>
  `$${(Math.max(credits, 0) / AUTUMN_SEO_DATA_CREDITS_PER_USD).toFixed(2)}`;

/** Emails the org's owners, linking to the billing page. False when no email
 *  went out (none configured, no owner, or the send failed). */
async function emailOwners(
  organizationId: string,
  title: string,
  message: string,
) {
  try {
    const appUrl = (await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "";
    const linkUrl = `${appUrl.replace(/\/$/, "")}/billing`;
    let sent = false;
    for (const email of await AuthRepository.listOwnerEmails(organizationId))
      sent =
        (await sendNoticeEmail({ email, title, message, linkUrl })) || sent;
    return sent;
  } catch (error) {
    console.error("[billing] notice email failed", { organizationId, error });
    return false;
  }
}

/** Tells the owners what the admin just recorded. Called once per applied
 *  change, so it can't repeat. A downgrade sends nothing: it follows a refund
 *  or cancellation the admin has already discussed with the customer. */
export async function notifyPlanChange(
  organizationId: string,
  change: AdminBillingAction,
) {
  if (change.action === "downgrade") return;
  const account = await getBillingAccountRow(organizationId);
  const until = account?.currentPeriodEnd
    ? formatDate(account.currentPeriodEnd)
    : null;
  const notice = {
    pro_month: {
      title: "Your Pro plan is active",
      message: `Thanks for your payment. Your AGS MASTER Pro plan is active and paid until ${until}, with $50 of credits for the month.`,
    },
    pro_year: {
      title: "Your Pro Yearly plan is active",
      message: `Thanks for your payment. Your AGS MASTER Pro Yearly plan is active and paid until ${until}. You get $50 of credits each month of the year.`,
    },
    lifetime: {
      title: "Lifetime access is active",
      message:
        "Thanks for your payment. Your AGS MASTER account now has Lifetime access, and $500 of credits have been added.",
    },
    add_credits: {
      title: "Credits added",
      message: `${formatUsd(change.action === "add_credits" ? change.credits : 0)} of extra credits were added to your AGS MASTER account. Extra credits never expire.`,
    },
  }[change.action];
  await emailOwners(organizationId, notice.title, notice.message);
}

/**
 * Records a notice before sending it, so a second run the same day (or a
 * retried cron) can't send it again. A failed send removes the record, so
 * the next daily run tries again.
 */
async function sendOnce(
  notice: {
    organizationId: string;
    kind: NoticeKind;
    periodKey: string;
    title: string;
    message: string;
  },
  now: Date,
) {
  const { organizationId, kind, periodKey } = notice;
  const claimed = await db
    .insert(billingNotices)
    .values({ organizationId, kind, periodKey, sentAt: now.toISOString() })
    .onConflictDoNothing()
    .returning({ kind: billingNotices.kind });
  if (claimed.length === 0) return false;
  if (await emailOwners(organizationId, notice.title, notice.message))
    return true;
  await db
    .delete(billingNotices)
    .where(
      and(
        eq(billingNotices.organizationId, organizationId),
        eq(billingNotices.kind, kind),
        eq(billingNotices.periodKey, periodKey),
      ),
    );
  return false;
}

/** A Pro year doesn't renew by itself: remind the owners 14 days and 3 days
 *  before it ends, and once it has ended. */
async function remindYearlyRenewals(now: Date) {
  const accounts = await db
    .select({
      organizationId: billingAccounts.organizationId,
      planId: billingAccounts.planId,
      planStatus: billingAccounts.planStatus,
      currentPeriodEnd: billingAccounts.currentPeriodEnd,
      paddleSubscriptionId: billingAccounts.paddleSubscriptionId,
    })
    .from(billingAccounts)
    .where(eq(billingAccounts.planId, AUTUMN_PRO_YEARLY_PLAN_ID));
  let sent = 0;
  for (const account of accounts) {
    const end = account.currentPeriodEnd;
    if (!end) continue;
    // A Paddle subscription renews the year by itself unless canceled, so
    // "pay for another year" would be wrong.
    if (account.paddleSubscriptionId && account.planStatus !== "canceled")
      continue;
    const left = Date.parse(end) - now.getTime();
    const ends = formatDate(end);
    let notice: { kind: NoticeKind; title: string; message: string } | null =
      null;
    if (left > 3 * DAY_MS && left <= 14 * DAY_MS)
      notice = {
        kind: "year_ending_soon",
        title: "Your Pro Yearly plan ends soon",
        message: `Your AGS MASTER Pro Yearly plan ends on ${ends} and doesn't renew by itself. To keep your access and monthly credits, pay for another year from the billing page before then.`,
      };
    else if (left > 0 && left <= 3 * DAY_MS)
      notice = {
        kind: "year_ending_now",
        title: "Your Pro Yearly plan ends in a few days",
        message: `Your AGS MASTER Pro Yearly plan ends on ${ends}. Pay for another year from the billing page to keep your access and monthly credits.`,
      };
    else if (left <= 0 && hasPaidAccess(account, now)) {
      const stops = paidAccessEndsAt(account);
      notice = {
        kind: "year_ended",
        title: "Your Pro Yearly plan has ended",
        message: `Your AGS MASTER Pro Yearly plan ended on ${ends}. Your access continues until ${stops ? formatDate(stops) : "the end of the grace period"}, so you have a few days to pay for another year from the billing page.`,
      };
    }
    if (
      notice &&
      (await sendOnce(
        { organizationId: account.organizationId, periodKey: end, ...notice },
        now,
      ))
    )
      sent += 1;
  }
  return sent;
}

/** Paid accounts under $5 of credits get one email per credit period. */
async function warnLowCredits(now: Date) {
  const accounts = await db
    .select({
      organizationId: billingAccounts.organizationId,
      planId: billingAccounts.planId,
      planStatus: billingAccounts.planStatus,
      currentPeriodEnd: billingAccounts.currentPeriodEnd,
    })
    .from(billingAccounts)
    .where(ne(billingAccounts.planId, "free"));
  const paid = accounts.filter((account) => hasPaidAccess(account, now));
  if (paid.length === 0) return 0;
  const balances = await db
    .select()
    .from(creditBalances)
    .where(
      inArray(
        creditBalances.organizationId,
        paid.map((account) => account.organizationId),
      ),
    );
  let sent = 0;
  for (const account of paid) {
    const pool = (id: string) =>
      balances.find(
        (row) =>
          row.organizationId === account.organizationId && row.pool === id,
      );
    const monthly = pool(AUTUMN_SEO_DATA_BALANCE_FEATURE_ID);
    const topup = pool(AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID);
    const left = (monthly?.remaining ?? 0) + (topup?.remaining ?? 0);
    if (left >= LOW_CREDITS) continue;
    // A refill, a new period or bought credits make a new key, so the next
    // time credits run low gets its own email.
    const periodKey = [
      account.currentPeriodEnd ?? "",
      monthly?.nextResetAt ?? "",
      monthly?.granted ?? 0,
      topup?.granted ?? 0,
    ].join("|");
    const refill = monthly?.nextResetAt
      ? ` Your monthly credits refill on ${formatDate(monthly.nextResetAt)}.`
      : "";
    if (
      await sendOnce(
        {
          organizationId: account.organizationId,
          kind: "low_credits",
          periodKey,
          title: "Your AGS MASTER credits are running low",
          message: `You have ${formatUsd(left)} of credits left, so research and AI writing will stop soon.${refill} You can buy extra credits from the billing page; they never expire.`,
        },
        now,
      )
    )
      sent += 1;
  }
  return sent;
}

/** Daily cron body. */
export async function sendBillingReminders(now = new Date()) {
  return {
    renewals: await remindYearlyRenewals(now),
    lowCredits: await warnLowCredits(now),
  };
}
