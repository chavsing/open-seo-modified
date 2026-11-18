import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOrganizationBillingAccount,
  reportPaypalSubscription,
} from "@/server/billing/billing-account";
import { listCreditEvents } from "@/server/billing/creditLedger";
import {
  captureCheckoutOrder,
  createCheckoutOrder,
} from "@/server/billing/paypal-checkout";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { PAYPAL_SUBSCRIPTION_ID_PATTERN } from "@/shared/billing";
import {
  requireAuthenticatedContext,
  requireAuthenticatedReadContext,
} from "@/serverFunctions/middleware";

export const getBillingAccount = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedReadContext)
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

// The app's PayPal checkout for one-time payments: the server sets the price
// and account on the order, then captures it once the customer approves.
export const createPaypalCheckoutOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({ product: z.enum(["pro_year", "lifetime", "credit_pack"]) }),
  )
  .handler(async ({ data, context }) => {
    if (!(await isHostedServerAuthMode())) throw new AppError("NOT_FOUND");
    return { orderId: await createCheckoutOrder(context, data.product) };
  });

export const capturePaypalCheckoutOrder = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ orderId: z.string().regex(/^[A-Z0-9]{10,40}$/) }))
  .handler(async ({ data, context }) => {
    if (!(await isHostedServerAuthMode())) throw new AppError("NOT_FOUND");
    return { status: await captureCheckoutOrder(context, data.orderId) };
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
  .middleware(requireAuthenticatedReadContext)
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
