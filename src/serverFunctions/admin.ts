import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AUTUMN_SEO_DATA_CREDITS_PER_USD } from "@/shared/billing";
import {
  applyBillingActionAsAdmin,
  isPlatformAdmin,
  requireAdmin,
  listRenewalsDueAsAdmin,
  listWaitingAccountsAsAdmin,
  searchAccountsAsAdmin,
} from "@/server/billing/admin-billing";
import {
  addAllowedEmailAsAdmin,
  getSignupAccessAsAdmin,
  removeAllowedEmailAsAdmin,
  setInviteOnlyAsAdmin,
} from "@/server/auth/signup-access";
import { getOpenRouterBalance } from "@/server/lib/openrouterBalance";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

/** What's left to spend on AI, so the admin can top up before it runs out. */
export const getAdminAiBalance = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    await requireAdmin(context.userEmail);
    return getOpenRouterBalance();
  });

export const getAdminStatus = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    isAdmin: await isPlatformAdmin(context.userEmail),
  }));

export const searchAdminAccounts = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  // No query lists the newest signups.
  .validator(z.object({ query: z.string().trim().min(3).max(200).nullable() }))
  .handler(({ data, context }) =>
    searchAccountsAsAdmin(context.userEmail, data.query),
  );

export const listWaitingAdminAccounts = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => listWaitingAccountsAsAdmin(context.userEmail));

export const listRenewalsDueAdminAccounts = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => listRenewalsDueAsAdmin(context.userEmail));

const adminActionSchema = z.object({
  requestId: z.string().uuid(),
  organizationId: z.string().min(1),
  change: z.discriminatedUnion("action", [
    z.object({ action: z.literal("pro_month") }),
    z.object({ action: z.literal("pro_year") }),
    z.object({ action: z.literal("lifetime") }),
    z.object({ action: z.literal("downgrade") }),
    z.object({
      action: z.literal("add_credits"),
      amountUsd: z.number().int().min(1).max(10_000),
    }),
  ]),
});

export const applyAdminBillingChange = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(adminActionSchema)
  .handler(({ data, context }) =>
    applyBillingActionAsAdmin({
      adminEmail: context.userEmail,
      requestId: data.requestId,
      organizationId: data.organizationId,
      change:
        data.change.action === "add_credits"
          ? {
              action: "add_credits",
              credits: data.change.amountUsd * AUTUMN_SEO_DATA_CREDITS_PER_USD,
            }
          : data.change,
    }),
  );

export const getSignupAccess = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => getSignupAccessAsAdmin(context.userEmail));

export const setSignupInviteOnly = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ inviteOnly: z.boolean() }))
  .handler(({ data, context }) =>
    setInviteOnlyAsAdmin(context.userEmail, data.inviteOnly),
  );

export const addSignupAllowedEmail = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ email: z.string().trim().email().max(320) }))
  .handler(({ data, context }) =>
    addAllowedEmailAsAdmin(context.userEmail, data.email),
  );

export const removeSignupAllowedEmail = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ email: z.string().trim().min(1).max(320) }))
  .handler(({ data, context }) =>
    removeAllowedEmailAsAdmin(context.userEmail, data.email),
  );
