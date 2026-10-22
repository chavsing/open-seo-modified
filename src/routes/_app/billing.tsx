import { createFileRoute, notFound } from "@tanstack/react-router";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Skeleton } from "@/client/components/ui/skeleton";
import { queryClient } from "@/client/tanstack-db";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { useSession } from "@/lib/auth-client";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { prefetchBillingAccount } from "@/client/features/billing/billingAccountQuery";
import { BillingUsageCard } from "@/client/features/billing/BillingUsageCard";
import { PlanPaymentAction } from "@/client/features/billing/PlanPaymentAction";
import { billingUsageEventsQueryOptions } from "@/client/features/billing/useBillingUsageEvents";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import {
  formatPlanPrice,
  getPlanName,
  includedCreditsFeature,
  PLAN_OFFERS,
  PRO_PLAN_OFFER,
} from "@/client/features/billing/plan-offers";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { PAYPAL_AUTOPAY_URL } from "@/shared/billing";

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
  const { data: session } = useSession();
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
                          ? `You’ve used this month’s credits. They refill on ${refillDate}, or email ${SUPPORT_EMAIL} to add more.`
                          : `You’ve used your credits. Email ${SUPPORT_EMAIL} to add more.`}
                    </p>
                  ) : isLowCredits ? (
                    <p className="mt-2 text-xs text-amber-600">
                      You&rsquo;re running low on credits.{" "}
                      {isFreePlan
                        ? `Upgrade to get $${PRO_PLAN_OFFER.includedCreditsUsd}/month.`
                        : `Email ${SUPPORT_EMAIL} to add more.`}
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
                            "Access to all OpenSEO features",
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
                      Pay with the same email as this account
                      {session?.user?.email ? ` (${session.user.email})` : ""}.
                      Your plan is turned on once we confirm your payment.
                    </p>
                  </div>
                ) : account.isLifetime ? (
                  <p className="border-t border-border pt-3 text-sm text-muted-foreground">
                    Lifetime access: nothing to renew. Need more credits? Email{" "}
                    {supportLink}.
                  </p>
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
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <BillingUsageCard />

      <p className="text-xs text-muted-foreground">
        Payments are handled by PayPal. Questions? Email {supportLink}.
      </p>
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
