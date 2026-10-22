import { autumnSeoDataCreditsToUsd } from "@/shared/billing";
import {
  applyAdminBillingAction,
  listReportedPaypalSubscriptions,
  searchBillingAccounts,
  type AdminBillingAction,
} from "@/server/billing/adminBillingRepository";
import { hasPaidAccess } from "@/server/billing/plan-access";
import { AppError } from "@/server/lib/errors";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";

// The client's admin page: after a PayPal payment he finds the customer by
// email and changes the plan or adds credits here. Admins are the emails in
// ADMIN_EMAILS (comma-separated), in hosted mode only.

export async function isPlatformAdmin(email: string) {
  if (!(await isHostedServerAuthMode())) return false;
  const admins = ((await getOptionalEnvValue("ADMIN_EMAILS")) ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}

async function requireAdmin(email: string) {
  if (!(await isPlatformAdmin(email))) throw new AppError("FORBIDDEN");
}

export async function searchAccountsAsAdmin(
  adminEmail: string,
  query: string | null,
) {
  await requireAdmin(adminEmail);
  return (await searchBillingAccounts(query)).map(toAdminAccount);
}

/** Customers whose PayPal subscription the admin has not handled yet. */
export async function listWaitingAccountsAsAdmin(adminEmail: string) {
  await requireAdmin(adminEmail);
  return (await listReportedPaypalSubscriptions()).map(toAdminAccount);
}

function toAdminAccount(
  row: Awaited<ReturnType<typeof searchBillingAccounts>>[number],
) {
  return {
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    email: row.email,
    role: row.role,
    planId: row.account?.planId ?? "free",
    hasPaidAccess: hasPaidAccess(row.account),
    paidUntil: row.account?.currentPeriodEnd ?? null,
    monthlyRemainingUsd: autumnSeoDataCreditsToUsd(row.monthly?.remaining ?? 0),
    extraRemainingUsd: autumnSeoDataCreditsToUsd(row.topup?.remaining ?? 0),
    paypalSubscriptionId: row.account?.paypalSubscriptionId ?? null,
    // Set until the admin activates or downgrades the account.
    paypalReportedAt: row.account?.paypalSubscriptionReportedAt ?? null,
    // Another account reported the same subscription ID.
    paypalSubscriptionShared: row.subscriptionIdShared,
  };
}

export async function applyBillingActionAsAdmin(args: {
  adminEmail: string;
  requestId: string;
  organizationId: string;
  change: AdminBillingAction;
}) {
  await requireAdmin(args.adminEmail);
  const result = await applyAdminBillingAction(args);
  console.info("[billing] admin action", {
    adminEmail: args.adminEmail,
    organizationId: args.organizationId,
    change: args.change,
    applied: result.applied,
  });
  return result;
}
