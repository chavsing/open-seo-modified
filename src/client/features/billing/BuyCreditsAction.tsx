import { Button } from "@/client/components/ui/button";
import { captureClientEvent } from "@/client/lib/posthog";
import {
  autumnSeoDataCreditsToUsd,
  CREDIT_PACK_CREDITS,
  PAYPAL_CREDIT_PACK_URL,
} from "@/shared/billing";

export const CREDIT_PACK_LABEL = `Buy $${autumnSeoDataCreditsToUsd(CREDIT_PACK_CREDITS)} of credits`;

/** The credit pack's PayPal link, for paid plans that need more credits. The
 *  client adds the credits from the admin page once the payment arrives. */
export function BuyCreditsAction() {
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        className="w-full"
        nativeButton={false}
        render={
          <a
            href={PAYPAL_CREDIT_PACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => captureClientEvent("billing:credit_pack_click")}
          />
        }
      >
        {CREDIT_PACK_LABEL}
      </Button>
      <p className="text-xs text-muted-foreground">
        Extra credits never expire. Pay with the same email as this account; we
        add the credits once we confirm your payment.
      </p>
    </div>
  );
}
