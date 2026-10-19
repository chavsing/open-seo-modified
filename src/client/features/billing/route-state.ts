import type { PlanStatus } from "@/shared/billing";

export function getSubscribeRouteState(args: {
  isCustomerLoading: boolean;
  isCustomerError: boolean;
  hasCustomerData: boolean;
  hasManagedAccess: boolean;
  planStatus: PlanStatus;
  isUpgradeFlow: boolean;
}) {
  if (args.isCustomerLoading) {
    return "loading" as const;
  }

  // A failed refetch with the customer already loaded keeps the paywall,
  // since every Upgrade button in the app lands here.
  if (args.isCustomerError && !args.hasCustomerData) {
    return "error" as const;
  }

  if (args.planStatus === "paid") {
    return "redirectToApp" as const;
  }

  // Free-plan users landing here outside the upgrade flow belong in the app,
  // not on the paywall.
  if (args.hasManagedAccess && !args.isUpgradeFlow) {
    return "redirectToApp" as const;
  }

  return "showPaywall" as const;
}
