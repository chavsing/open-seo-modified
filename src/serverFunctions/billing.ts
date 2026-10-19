import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { CHECKOUT_PLAN_IDS } from "@/shared/billing";
import { getOrganizationBillingAccount } from "@/server/billing/billing-account";
import { listCreditEvents } from "@/server/billing/creditLedger";
import {
  createBillingPortalUrl,
  createPlanCheckoutUrl,
  createTopUpCheckoutUrl,
} from "@/server/billing/checkout";
import {
  listOrganizationInvoices,
  setOrganizationInvoiceEmails,
} from "@/server/billing/invoices";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getBillingAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => getOrganizationBillingAccount(context));

// Each returns a URL for the browser to open: Stripe or Autumn checkout, or
// the Stripe billing portal.

export const createPlanCheckout = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      planId: z.enum(CHECKOUT_PLAN_IDS),
      redirectTo: z.string(),
    }),
  )
  .handler(({ data, context }) =>
    createPlanCheckoutUrl(context, {
      ...data,
      origin: getPublicOrigin(getRequest()),
    }),
  );

export const createTopUpCheckout = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ amountUsd: z.number().int().min(10).max(99) }))
  .handler(({ data, context }) =>
    createTopUpCheckoutUrl(context, {
      ...data,
      origin: getPublicOrigin(getRequest()),
    }),
  );

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ returnTo: z.string() }))
  .handler(({ data, context }) =>
    createBillingPortalUrl(context, {
      ...data,
      origin: getPublicOrigin(getRequest()),
    }),
  );

export const listBillingInvoices = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => listOrganizationInvoices(context));

export const setInvoiceEmails = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ enabled: z.boolean() }))
  .handler(({ data, context }) =>
    setOrganizationInvoiceEmails(context, data.enabled),
  );

const billingUsageRangeSchema = z.object({
  start: z.number(),
  end: z.number(),
});

const billingUsagePropertySchema = z.json();

export type BillingUsageEvent = {
  timestamp: number;
  value: number;
  properties: Record<string, z.infer<typeof billingUsagePropertySchema>>;
};

const pathsSchema = z.array(z.string());

export const getBillingUsageEvents = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(billingUsageRangeSchema)
  .handler(async ({ data, context }) => {
    if (!(await isHostedServerAuthMode())) {
      return [];
    }

    const rows = await listCreditEvents({
      organizationId: context.organizationId,
      start: new Date(data.start).toISOString(),
      end: new Date(data.end).toISOString(),
    });
    return rows.map((row): BillingUsageEvent => {
      const properties: BillingUsageEvent["properties"] = {};
      if (row.creditFeature) properties.creditFeature = row.creditFeature;
      const paths = row.paths
        ? pathsSchema.safeParse(JSON.parse(row.paths))
        : null;
      if (paths?.success) properties.paths = paths.data;
      return {
        timestamp: Date.parse(row.createdAt),
        value: row.credits,
        properties,
      };
    });
  });
