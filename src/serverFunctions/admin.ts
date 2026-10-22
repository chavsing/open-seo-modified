import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AUTUMN_SEO_DATA_CREDITS_PER_USD } from "@/shared/billing";
import {
  applyBillingActionAsAdmin,
  isPlatformAdmin,
  listWaitingAccountsAsAdmin,
  searchAccountsAsAdmin,
} from "@/server/billing/admin-billing";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

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

const adminActionSchema = z.object({
  requestId: z.string().uuid(),
  organizationId: z.string().min(1),
  change: z.discriminatedUnion("action", [
    z.object({ action: z.literal("pro_month") }),
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
