import { describe, expect, it } from "vitest";
import { getSubscribeRouteState } from "./route-state";

describe("getSubscribeRouteState", () => {
  const base = {
    isCustomerLoading: false,
    isCustomerError: false,
    hasCustomerData: true,
    hasManagedAccess: true,
    planStatus: "free" as const,
    isUpgradeFlow: false,
  };

  it("redirects paying customers into the app", () => {
    expect(getSubscribeRouteState({ ...base, planStatus: "paid" })).toBe(
      "redirectToApp",
    );
  });

  it("redirects free-plan users into the app unless they asked to upgrade", () => {
    expect(getSubscribeRouteState(base)).toBe("redirectToApp");
    expect(getSubscribeRouteState({ ...base, isUpgradeFlow: true })).toBe(
      "showPaywall",
    );
  });

  it("keeps the paywall when a customer refetch fails, but not a first load", () => {
    const failed = { ...base, isUpgradeFlow: true, isCustomerError: true };

    expect(getSubscribeRouteState(failed)).toBe("showPaywall");
    expect(getSubscribeRouteState({ ...failed, hasCustomerData: false })).toBe(
      "error",
    );
  });
});
