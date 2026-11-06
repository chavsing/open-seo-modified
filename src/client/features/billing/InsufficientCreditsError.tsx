import type { ReactElement } from "react";
import { Link } from "@tanstack/react-router";
import { ErrorState } from "@/client/components/ErrorState";
import { Button } from "@/client/components/ui/button";
import { PRO_PLAN_OFFER } from "@/client/features/billing/plan-offers";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { CREDIT_PACK_LABEL } from "@/client/features/billing/BuyCreditsAction";
import {
  BILLING_ROUTE,
  PAYPAL_CREDIT_PACK_URL,
  SUBSCRIBE_ROUTE,
} from "@/shared/billing";

/**
 * An out-of-credits failure that says how to get more: a free plan upgrades,
 * a paid plan buys a credit pack, and until the customer loads the
 * generic copy points at Billing. A retry can't fix it, so there is no retry button.
 *
 * The member role is left to the banner and the billing page: reading it here
 * would pull a server function into every page error (and every test that
 * renders one).
 */
export function InsufficientCreditsError({
  variant,
  title,
}: {
  variant?: "inline" | "card" | "page";
  title?: string;
}) {
  const { accountQuery, isFreePlan, refillDate } = useCreditBalance();

  let message: string;
  let action: ReactElement;
  if (!accountQuery.data) {
    message = getStandardErrorMessage(new Error("INSUFFICIENT_CREDITS"));
    action = (
      <CreditsButton link={<Link to={BILLING_ROUTE} />} label="Go to Billing" />
    );
  } else if (isFreePlan) {
    message = `You don't have enough credits for this. Upgrade to get $${PRO_PLAN_OFFER.includedCreditsUsd} of credits every month.`;
    action = (
      <CreditsButton
        link={<Link to={SUBSCRIBE_ROUTE} search={{ upgrade: true }} />}
        label="Upgrade plan"
      />
    );
  } else {
    message = refillDate
      ? `You don't have enough credits for this. Your monthly credits refill on ${refillDate}, or buy extra credits now.`
      : `You don't have enough credits for this. Buy extra credits to keep going.`;
    action = (
      <CreditsButton
        link={
          <a
            href={PAYPAL_CREDIT_PACK_URL}
            target="_blank"
            rel="noopener noreferrer"
          />
        }
        label={CREDIT_PACK_LABEL}
      />
    );
  }

  return (
    <ErrorState
      variant={variant}
      title={title}
      message={message}
      action={action}
    />
  );
}

function CreditsButton({ link, label }: { link: ReactElement; label: string }) {
  return (
    <Button variant="outline" size="sm" nativeButton={false} render={link}>
      {label}
    </Button>
  );
}
