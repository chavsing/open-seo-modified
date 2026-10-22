import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOrganizationBillingAccount,
  reportPaypalSubscription,
} from "@/server/billing/billing-account";
import { listCreditEvents } from "@/server/billing/creditLedger";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { PAYPAL_SUBSCRIPTION_ID_PATTERN } from "@/shared/billing";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getBillingAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => getOrganizationBillingAccount(context));

export const reportPaypalSubscriptionApproved = createServerFn({
  method: "POST",
})
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      subscriptionId: z.string().regex(PAYPAL_SUBSCRIPTION_ID_PATTERN),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!(await isHostedServerAuthMode())) throw new AppError("NOT_FOUND");
    await reportPaypalSubscription(context, data.subscriptionId);
  });

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
