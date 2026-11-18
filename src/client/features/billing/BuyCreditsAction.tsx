import { PaypalCheckoutButton } from "@/client/features/billing/PaypalCheckoutButton";
import { CREDIT_PACK_LABEL } from "@/client/features/billing/plan-offers";
import {
  CREDIT_PACK_PRICE_USD,
  PAYPAL_CREDIT_PACK_URL,
} from "@/shared/billing";

/** The credit pack, for paid plans that need more credits. The credits are
 *  added as soon as PayPal confirms the payment. */
export function BuyCreditsAction() {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {CREDIT_PACK_LABEL} for ${CREDIT_PACK_PRICE_USD}
      </p>
      <PaypalCheckoutButton
        product="credit_pack"
        fallbackUrl={PAYPAL_CREDIT_PACK_URL}
        fallbackLabel={CREDIT_PACK_LABEL}
      />
      <p className="text-xs text-muted-foreground">
        Extra credits never expire. They are added as soon as PayPal confirms
        the payment.
      </p>
    </div>
  );
}
