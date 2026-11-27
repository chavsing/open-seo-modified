import { useQuery } from "@tanstack/react-query";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import { PaddleCheckoutButton } from "@/client/features/billing/PaddleCheckoutButton";
import { PaypalCheckoutButton } from "@/client/features/billing/PaypalCheckoutButton";
import { CREDIT_PACK_LABEL } from "@/client/features/billing/plan-offers";
import {
  CREDIT_PACK_PRICE_USD,
  PAYPAL_CREDIT_PACK_URL,
} from "@/shared/billing";

/** The credit pack, for paid plans that need more credits. The credits are
 *  added as soon as the payment is confirmed. */
export function BuyCreditsAction() {
  const { data: account } = useQuery(billingAccountQueryOptions());
  const provider = account?.paddle ? "Paddle" : "PayPal";
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {CREDIT_PACK_LABEL} for ${CREDIT_PACK_PRICE_USD}
      </p>
      {account?.paddle ? (
        <PaddleCheckoutButton product="credit_pack" label={CREDIT_PACK_LABEL} />
      ) : (
        <PaypalCheckoutButton
          product="credit_pack"
          fallbackUrl={PAYPAL_CREDIT_PACK_URL}
          fallbackLabel={CREDIT_PACK_LABEL}
        />
      )}
      <p className="text-xs text-muted-foreground">
        Extra credits never expire. They are added as soon as {provider}{" "}
        confirms the payment.
      </p>
    </div>
  );
}
