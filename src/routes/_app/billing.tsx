import { useMutation } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { LegalLinks } from "@/client/components/LegalLinks";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import { queryClient } from "@/client/tanstack-db";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { prefetchBillingAccount } from "@/client/features/billing/billingAccountQuery";
import { BillingUsageCard } from "@/client/features/billing/BillingUsageCard";
import { PlanPaymentAction } from "@/client/features/billing/PlanPaymentAction";
import { billingUsageEventsQueryOptions } from "@/client/features/billing/useBillingUsageEvents";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import { BuyCreditsAction } from "@/client/features/billing/BuyCreditsAction";
import {
  formatPlanPrice,
  getPlanName,
  includedCreditsFeature,
  PLAN_OFFERS,
  PRO_PLAN_OFFER,
  PRO_YEARLY_PLAN_OFFER,
} from "@/client/features/billing/plan-offers";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { getPaddlePortalLink } from "@/serverFunctions/billing";
import { PAYPAL_AUTOPAY_URL } from "@/shared/billing";
import { BRAND_NAME } from "@/shared/brand";

export const Route = createFileRoute("/_app/billing")({
  // The loader fills the module-scoped query client, so keep it out of server
  // requests: one worker isolate must not cache another account's billing.
  ssr: false,
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) {
      throw notFound();
    }
  },
  // Start both reads on link intent and on a full load alongside the session
  // check, without holding up navigation.
  loader: () => {
    prefetchBillingAccount();
    void queryClient.prefetchQuery(billingUsageEventsQueryOptions());
  },
  component: BillingPage,
});

const supportLink = (
  <a
    className="underline underline-offset-2 hover:text-foreground"
    href={`mailto:${SUPPORT_EMAIL}`}
  >
    {SUPPORT_EMAIL}
  </a>
);

function BillingPage() {
  const {
    accountQuery,
    isFreePlan,
    monthlyRemaining,
    topUpRemaining,
    totalRemaining,
    isOutOfCredits,
    isLowCredits,
    refillDate,
  } = useCreditBalance();
  const account = accountQuery.data;
  const provider = account?.paddle ? "Paddle" : "PayPal";

  // Plan changes are owner-only; other members see balances but are pointed
  // at the owner instead.
  const canManageBilling = useCanManageBilling();

  return (
    <div className="mx-auto box-content max-w-7xl space-y-5 px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <PageHeader title="Billing" />

      {accountQuery.isPending ? (
        <div className="grid gap-5 md:grid-cols-2">
          <SubscriptionCardSkeleton />
        </div>
      ) : !account ? (
        <QueryError
          cause={accountQuery.error}
          fallback="We couldn't load your billing details right now. Please try again."
          onRetry={() => void accountQuery.refetch()}
          isRetrying={accountQuery.isFetching}
        />
      ) : (
        <>
          {accountQuery.isError ? (
            <QueryError
              cause={accountQuery.error}
              fallback="Failed to refresh billing details"
              onRetry={() => void accountQuery.refetch()}
              isRetrying={accountQuery.isFetching}
            />
          ) : null}

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardContent className="flex h-full flex-col justify-between gap-4">
                <div>
                  <div className="text-2xl font-semibold tabular-nums">
                    ${totalRemaining.toFixed(2)}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      remaining
                    </span>
                  </div>
                  {!isFreePlan && topUpRemaining > 0 ? (
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {account.isLifetime ? "Included" : "Monthly"} $
                        {monthlyRemaining.toFixed(2)}
                      </span>
                      <span>&middot;</span>
                      <span className="tabular-nums">
                        Extra ${topUpRemaining.toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                  {isOutOfCredits ? (
                    <p className="mt-2 text-xs text-destructive">
                      {isFreePlan
                        ? "You’ve used your free credits. Upgrade your plan to continue."
                        : refillDate
                          ? `You’ve used this month’s credits. They refill on ${refillDate}, or buy extra credits below.`
                          : "You’ve used your credits. Buy extra credits below."}
                    </p>
                  ) : isLowCredits ? (
                    <p className="mt-2 text-xs text-amber-600">
                      You&rsquo;re running low on credits.{" "}
                      {isFreePlan
                        ? `Upgrade to get $${PRO_PLAN_OFFER.includedCreditsUsd}/month.`
                        : "Buy extra credits below."}
                    </p>
                  ) : null}
                </div>

                <div className="text-sm">
                  <span className="font-medium">Plan</span>{" "}
                  <span className="text-muted-foreground">
                    {account.paidPlanId
                      ? getPlanName(account.paidPlanId)
                      : "Free Plan"}
                  </span>
                  {account.paidPlanId ? (
                    <span className="text-muted-foreground">
                      {" "}
                      &middot; ${account.monthlyCreditsUsd.toFixed(2)} of Usage
                      Credits {account.isLifetime ? "included" : "each month"}
                    </span>
                  ) : null}
                </div>

                {!canManageBilling ? (
                  <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                    Only the organization owner can change the plan. Ask them if
                    you need more credits.
                  </p>
                ) : isFreePlan ? (
                  <div className="space-y-4 border-t border-border pt-3">
                    {PLAN_OFFERS.map((offer) => (
                      <div key={offer.planId} className="space-y-3">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="text-sm font-medium">
                            {offer.name}
                          </span>
                          <span className="text-sm font-medium tabular-nums">
                            {formatPlanPrice(offer)}
                          </span>
                        </div>
                        <ul className="space-y-1.5">
                          {[
                            `Access to all ${BRAND_NAME} features`,
                            includedCreditsFeature(offer),
                          ].map((item) => (
                            <li
                              key={item}
                              className="flex gap-2 text-xs text-muted-foreground"
                            >
                              <span className="mt-[1px] shrink-0 text-muted-foreground/60">
                                &mdash;
                              </span>
                              {item}
                            </li>
                          ))}
                        </ul>
                        <PlanPaymentAction offer={offer} />
                      </div>
                    ))}
                    <p className="text-xs text-muted-foreground">
                      Your plan turns on as soon as {provider} confirms the
                      payment.
                    </p>
                  </div>
                ) : account.isLifetime ? (
                  <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                    Lifetime access: nothing to renew. Questions? Email{" "}
                    {supportLink}.
                  </p>
                ) : account.isPaddleSubscription ? (
                  <PaddleSubscriptionDetails
                    paidUntil={account.paidUntil}
                    isYearly={account.isYearly}
                    isCanceled={account.isCanceled}
                    isPastDue={account.isPastDue}
                  />
                ) : account.isYearly ? (
                  <div className="space-y-3 border-t border-border pt-3">
                    <p className="text-sm text-muted-foreground">
                      {account.paidUntil
                        ? `Paid through ${new Date(account.paidUntil).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}. `
                        : null}
                      {refillDate
                        ? `Your credits refill on ${refillDate}. `
                        : null}
                      The yearly plan doesn&rsquo;t renew by itself: to keep it,
                      pay for another year before it ends. Questions? Email{" "}
                      {supportLink}.
                    </p>
                    {canManageBilling ? (
                      <PlanPaymentAction offer={PRO_YEARLY_PLAN_OFFER} />
                    ) : null}
                  </div>
                ) : (
                  <div className="space-y-3 border-t border-border pt-3">
                    <p className="text-sm text-muted-foreground">
                      {refillDate
                        ? `Paid through ${refillDate}. PayPal renews it automatically.`
                        : "PayPal renews your plan automatically."}{" "}
                      To cancel, stop the automatic payment in PayPal.
                    </p>
                    <Button
                      variant="secondary"
                      className="w-full"
                      nativeButton={false}
                      render={
                        <a
                          href={PAYPAL_AUTOPAY_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                      }
                    >
                      Manage in PayPal
                    </Button>
                  </div>
                )}
                {canManageBilling && !isFreePlan ? <BuyCreditsAction /> : null}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <BillingUsageCard />

      <p className="text-xs text-muted-foreground">
        Payments are handled by {provider}. Questions? Email {supportLink}.
      </p>
      <LegalLinks align="start" />
    </div>
  );
}

const formatDay = (epochMs: number) =>
  new Date(epochMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/** A Pro plan paid by Paddle subscription: when it renews or ends, and the
 *  link to Paddle's billing portal to change the card or cancel. */
function PaddleSubscriptionDetails({
  paidUntil,
  isYearly,
  isCanceled,
  isPastDue,
}: {
  paidUntil: number | null;
  isYearly: boolean;
  isCanceled: boolean;
  isPastDue: boolean;
}) {
  const portal = useMutation({
    mutationFn: () => getPaddlePortalLink(),
    // The link is single-use and short-lived, so it opens right away.
    onSuccess: ({ url }) => window.location.assign(url),
  });
  const until = paidUntil ? formatDay(paidUntil) : null;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <p className="text-sm text-muted-foreground">
        {isCanceled
          ? until
            ? `Canceled. Your plan stays active until ${until}.`
            : "Canceled. Your plan stays active until the end of the paid period."
          : isPastDue
            ? "Your last payment didn't go through. Update your card in the billing portal to keep your plan."
            : until
              ? `Paid through ${until}. Renews automatically every ${isYearly ? "year" : "month"}.`
              : `Renews automatically every ${isYearly ? "year" : "month"}.`}{" "}
        Update your card, download invoices or cancel in the billing portal.
      </p>
      <Button
        variant="secondary"
        className="w-full"
        disabled={portal.isPending}
        onClick={() => portal.mutate()}
      >
        {portal.isPending ? "Opening..." : "Manage billing"}
      </Button>
      {portal.isError ? (
        <p role="alert" className="text-sm text-destructive">
          The billing portal couldn&rsquo;t open. Please try again, or email{" "}
          {SUPPORT_EMAIL}.
        </p>
      ) : null}
    </div>
  );
}

/** The subscription card's shape while the billing account loads. */
function SubscriptionCardSkeleton() {
  return (
    <Card aria-busy>
      <CardContent className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}
