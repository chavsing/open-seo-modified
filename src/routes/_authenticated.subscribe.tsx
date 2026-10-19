import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowRight } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { StatusScreen } from "@/client/components/StatusScreen";
import {
  billingAccountQueryOptions,
  prefetchBillingAccount,
} from "@/client/features/billing/billingAccountQuery";
import { PlanPageAccountMenu } from "@/client/features/billing/PlanPageAccountMenu";
import { PlanOfferCard } from "@/client/features/billing/PlanOfferCard";
import {
  includedCreditsFeature,
  PLAN_OFFERS,
  type PlanOffer,
} from "@/client/features/billing/plan-offers";
import { captureClientEvent } from "@/client/lib/posthog";
import { useSession } from "@/lib/auth-client";
import { getSubscribeRouteState } from "@/client/features/billing/route-state";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { Button } from "@/client/components/ui/button";

const planFeatures = (offer: PlanOffer) => [
  "Keyword research, backlinks, rank tracking, and site audits",
  "MCP server and agent skills for Claude, Cursor, and ChatGPT",
  "Google Search Console Integration",
  includedCreditsFeature(offer),
];

export const Route = createFileRoute("/_authenticated/subscribe")({
  // The loader fills the module-scoped query client, so keep it out of server
  // requests: one worker isolate must not cache another account's billing.
  ssr: false,
  validateSearch: (
    search: Record<string, unknown>,
  ): { upgrade?: true; redirect?: string } => ({
    upgrade:
      search.upgrade === true || search.upgrade === "true" ? true : undefined,
    redirect:
      typeof search.redirect === "string"
        ? normalizeAuthRedirect(search.redirect)
        : undefined,
  }),
  // Start the billing read alongside the session check, not after it.
  loader: () => {
    prefetchBillingAccount();
  },
  component: SubscribePage,
});

function SubscribePage() {
  const navigate = useNavigate();
  const { upgrade: isUpgradeFlow, redirect } = Route.useSearch();
  const { data: session } = useSession();
  const accountQuery = useQuery(billingAccountQueryOptions());
  const account = accountQuery.data;

  // Paying is owner-only; other members hitting the paywall are pointed at
  // their organization owner instead.
  const canManageBilling = useCanManageBilling();

  const subscribeRouteState = getSubscribeRouteState({
    isCustomerLoading: accountQuery.isPending,
    isCustomerError: accountQuery.isError,
    hasCustomerData: account !== undefined,
    hasManagedAccess: account?.hasManagedAccess ?? false,
    planStatus: account?.planStatus ?? "free",
    isUpgradeFlow: isUpgradeFlow === true,
  });

  useEffect(() => {
    if (subscribeRouteState === "redirectToApp") {
      void navigate({ href: redirect ?? "/", replace: true });
    }
  }, [navigate, redirect, subscribeRouteState]);

  useEffect(() => {
    if (subscribeRouteState === "showPaywall" && !isUpgradeFlow) {
      captureClientEvent("billing:paywall_viewed");
    }
  }, [isUpgradeFlow, subscribeRouteState]);

  if (
    subscribeRouteState === "loading" ||
    subscribeRouteState === "redirectToApp"
  ) {
    return <StatusScreen pending />;
  }

  if (subscribeRouteState === "error") {
    return (
      <StatusScreen logo title="Billing unavailable" size="sm">
        <QueryError
          cause={accountQuery.error}
          fallback="We couldn't verify your billing status right now. Please try again."
          onRetry={() => void accountQuery.refetch()}
          isRetrying={accountQuery.isFetching}
        />
      </StatusScreen>
    );
  }

  const firstName = session?.user?.name?.split(" ")[0] || "";
  const accountEmail = session?.user?.email;

  return (
    <div className="w-full max-w-sm space-y-6 md:max-w-3xl">
      <PlanPageAccountMenu email={accountEmail} />

      <div className="space-y-3 text-center">
        <img
          src="/transparent-logo.png"
          alt="OpenSEO"
          className="mx-auto size-10 rounded-lg"
        />
        <h1 className="text-xl font-semibold">
          {isUpgradeFlow
            ? "Upgrade your plan"
            : firstName
              ? `Welcome to OpenSEO, ${firstName}!`
              : "Welcome to OpenSEO!"}
        </h1>
        <p className="text-sm text-muted-foreground">
          SEO on your terms. All your SEO tools in one place at a fair price.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {PLAN_OFFERS.map((offer) => (
          <PlanOfferCard
            key={offer.planId}
            offer={offer}
            features={planFeatures(offer)}
          >
            {canManageBilling ? (
              <Button
                className="w-full"
                variant={offer.billing === "once" ? "default" : "secondary"}
                nativeButton={false}
                render={
                  <a
                    href={offer.paymentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      captureClientEvent("billing:paypal_click", {
                        planId: offer.planId,
                      })
                    }
                  />
                }
              >
                {offer.billing === "once"
                  ? "Pay once with PayPal"
                  : "Subscribe with PayPal"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only the organization owner can subscribe. Ask them to upgrade
                this organization.
              </p>
            )}
          </PlanOfferCard>
        ))}
      </div>

      {canManageBilling ? (
        <p className="text-center text-sm text-muted-foreground">
          Pay with the same email as this account
          {accountEmail ? (
            <>
              {" "}
              (
              <span className="font-medium text-foreground">
                {accountEmail}
              </span>
              )
            </>
          ) : null}
          . Your plan is turned on once we confirm your payment. If your PayPal
          email is different, email us your PayPal email so we can match it.
        </p>
      ) : null}

      <div className="text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Questions? Email{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={`mailto:${SUPPORT_EMAIL}`}
          >
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
        {isUpgradeFlow ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void navigate({ to: "/", replace: true })}
          >
            <ArrowRight className="size-3.5 rotate-180" />
            Back to app
          </Button>
        ) : null}
      </div>
    </div>
  );
}
