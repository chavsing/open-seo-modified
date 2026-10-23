import { Link } from "@tanstack/react-router";
import { AppBanner } from "@/client/layout/AppBanner";
import { PRO_PLAN_OFFER } from "@/client/features/billing/plan-offers";
import { useCreditBalance } from "@/client/features/billing/useCreditBalance";
import { useCanManageBilling } from "@/client/features/team/organizationQueries";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";
import { BRAND_NAME } from "@/shared/brand";

export function FreePlanBanner() {
  const { accountQuery, isFreePlan, isOutOfCredits, isLowCredits, refillDate } =
    useCreditBalance();
  const canManageBilling = useCanManageBilling();

  if (!accountQuery.data) {
    return null;
  }

  // Only the owner can change the plan or buy credits, so a link would lead
  // everyone else to a page where they can't act.
  if (!canManageBilling && (isOutOfCredits || isLowCredits)) {
    return (
      <AppBanner variant={isOutOfCredits ? "destructive" : "warning"}>
        {isOutOfCredits
          ? "Your organization has used its credits."
          : "Your organization is running low on credits."}{" "}
        Ask your organization owner to add more.
      </AppBanner>
    );
  }

  const creditsActionLink = isFreePlan ? (
    <Link
      to={SUBSCRIBE_ROUTE}
      search={{ upgrade: true }}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      Upgrade your plan
    </Link>
  ) : (
    <a
      href={`mailto:${SUPPORT_EMAIL}`}
      className="font-medium text-primary underline-offset-4 hover:underline"
    >
      Email us to add credits
    </a>
  );

  if (isOutOfCredits) {
    return (
      <AppBanner variant="destructive">
        {isFreePlan ? (
          <>
            You&rsquo;ve used your free credits. {creditsActionLink} to get $
            {PRO_PLAN_OFFER.includedCreditsUsd} of credits every month.
          </>
        ) : (
          <>
            You&rsquo;ve used {refillDate ? "this month’s" : "your"} credits.{" "}
            {creditsActionLink} to keep going
            {refillDate ? `, or wait for them to refill on ${refillDate}` : ""}.
          </>
        )}
      </AppBanner>
    );
  }

  if (isLowCredits) {
    return (
      <AppBanner variant="warning">
        You&rsquo;re running low on credits. {creditsActionLink} to keep using
        {BRAND_NAME}.
      </AppBanner>
    );
  }

  if (isFreePlan) {
    return (
      <AppBanner variant="info">
        We hope you&rsquo;re enjoying {BRAND_NAME}!{" "}
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Upgrade anytime
        </Link>{" "}
        or{" "}
        <Link
          to="/support"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          reach out with questions
        </Link>
        .
      </AppBanner>
    );
  }

  return null;
}
