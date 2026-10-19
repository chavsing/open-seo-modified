/* eslint-disable max-lines */
import { describe, expect, it, vi } from "vitest";
import { billingAccounts, creditEvents, creditHolds } from "@/db/schema";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
  creditsForProviderUsd,
} from "@/shared/billing";

const { testDb, isHostedServerAuthModeMock } = await vi.hoisted(async () => {
  const { createAiVisibilityTestDb } =
    await import("@/server/features/ai-visibility/aiVisibilityTestDb");
  return {
    testDb: await createAiVisibilityTestDb(),
    isHostedServerAuthModeMock: vi.fn(),
  };
});

vi.mock("cloudflare:workers", () => ({
  env: {
    DATABASE_PROVIDER: "d1",
    KV: { get: async () => null, put: async () => undefined },
  },
  waitUntil: vi.fn(),
}));
vi.mock("@/db", () => ({ db: testDb.db }));
vi.mock("@/db/runBatch", () => ({ runBatch: testDb.runBatch }));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: isHostedServerAuthModeMock,
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

// Mock every section module the client wraps so meterDataforseoCall's
// `execute()` resolves to a controllable fixture.
vi.mock("@/server/lib/dataforseo/labs", () => ({
  fetchRelatedKeywords: vi.fn(),
  fetchKeywordSuggestions: vi.fn(),
  fetchKeywordIdeas: vi.fn(),
  fetchDomainRankOverview: vi.fn(),
  fetchRankedKeywords: vi.fn(),
  fetchRelevantPages: vi.fn(),
  fetchKeywordOverview: vi.fn(),
  fetchSerpCompetitors: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo/serp", () => ({
  fetchLiveSerp: vi.fn(),
  fetchRankCheckSerp: vi.fn(),
  postRankCheckTasks: vi.fn(),
  fetchLocalSerp: vi.fn(),
  postLocalSerpTasks: vi.fn(),
  clampSerpDepth: (depth: number) => depth,
  SERP_ANALYSIS_DEPTH: 20,
}));
vi.mock("@/server/lib/dataforseo/business", () => ({
  fetchBusinessListingsSearch: vi.fn(),
  fetchQuestionsAnswers: vi.fn(),
  fetchMyBusinessInfo: vi.fn(),
  postGoogleReviewsTask: vi.fn(),
  postMyBusinessUpdatesTask: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo/google-ads", () => ({
  fetchAdsKeywordIdeas: vi.fn(),
  fetchAdsSearchVolume: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo/backlinks", () => ({
  fetchBacklinksSummary: vi.fn(),
  fetchBacklinksRows: vi.fn(),
  fetchReferringDomains: vi.fn(),
  fetchDomainPagesSummary: vi.fn(),
  fetchBacklinksHistory: vi.fn(),
  BACKLINKS_DEFAULT_LIMIT: 100,
}));
vi.mock("@/server/lib/dataforseo/lighthouse", () => ({
  fetchLighthouseResult: vi.fn(),
}));
vi.mock("@/server/lib/dataforseo/ai", () => ({
  fetchLlmMentionsSearch: vi.fn(),
  fetchLlmAggregatedMetrics: vi.fn(),
  fetchLlmTopPages: vi.fn(),
  fetchLlmCrossAggregatedMetrics: vi.fn(),
  fetchLlmResponse: vi.fn(),
  resolveLlmMentionsLimit: (limit?: number) => limit ?? 100,
  LLM_RESPONSE_WEB_SEARCH_DEFAULT: true,
}));

import { waitUntil } from "cloudflare:workers";
import {
  createDataforseoClient,
  mapDataforseoPathToCreditFeature,
} from "@/server/lib/dataforseo/client";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import { fetchBacklinksSummary } from "@/server/lib/dataforseo/backlinks";
import { fetchRankCheckSerp } from "@/server/lib/dataforseo/serp";
import {
  getOrCreateOrganizationCustomer,
  getUsageCreditsRemaining,
} from "@/server/billing/subscription";

// The harness seeds organization "organization".
const billingCustomer = {
  organizationId: "organization",
  userId: "user_123",
  userEmail: "alice@example.com",
};

const backlinksInput = {
  target: "example.com",
};
const backlinksPath = ["v3", "backlinks", "summary", "live"];

// Below the summary estimate, as a real charge is (the estimate is an upper bound).
const RAW_COST = 0.02;
const EXPECTED_CREDITS = creditsForProviderUsd(RAW_COST);
const ESTIMATED_CREDITS = creditsForProviderUsd(
  dataforseoPricing.backlinks.summary(backlinksInput),
);

async function setupHostedMode(monthly: number, topup = 0) {
  isHostedServerAuthModeMock.mockResolvedValue(true);
  await testDb.client.executeMultiple(`
    DELETE FROM credit_events;
    DELETE FROM credit_holds;
    DELETE FROM credit_balances;
    DELETE FROM billing_accounts;
  `);
  await testDb.seedProject();
  await getOrCreateOrganizationCustomer(billingCustomer);
  await testDb.client.executeMultiple(`
    UPDATE credit_balances SET remaining = ${monthly} WHERE pool = '${AUTUMN_SEO_DATA_BALANCE_FEATURE_ID}';
    UPDATE credit_balances SET remaining = ${topup} WHERE pool = '${AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID}';
  `);
}

const balances = () => getUsageCreditsRemaining(billingCustomer.organizationId);
const charges = async () =>
  (await testDb.db.select().from(creditEvents)).map((e) => ({
    pool: e.pool,
    credits: e.credits,
  }));
const openHolds = () => testDb.db.select().from(creditHolds);

function mockDataforseoResult(costUsd: number) {
  vi.mocked(fetchBacklinksSummary).mockResolvedValue({
    data: { rank: 42 },
    billing: { costUsd, path: backlinksPath },
  });
}

describe("meterDataforseoCall", () => {
  it("skips billing in non-hosted mode", async () => {
    isHostedServerAuthModeMock.mockResolvedValue(false);
    await testDb.client.execute("DELETE FROM billing_accounts");
    mockDataforseoResult(RAW_COST);

    const client = createDataforseoClient(billingCustomer);
    const result = await client.backlinks.summary(backlinksInput);

    expect(result).toEqual({ rank: 42 });
    expect(await testDb.db.select().from(billingAccounts)).toEqual([]);
  });

  it("never calls the provider when the hold is refused", async () => {
    await setupHostedMode(0);
    mockDataforseoResult(RAW_COST);

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });

    expect(fetchBacklinksSummary).not.toHaveBeenCalled();
    expect(await openHolds()).toEqual([]);
  });

  it("holds the estimate, then charges the billed cost", async () => {
    await setupHostedMode(5000);
    let heldDuringCall: number | undefined;
    vi.mocked(fetchBacklinksSummary).mockImplementation(async () => {
      heldDuringCall = 5000 - (await balances()).monthlyRemaining;
      return {
        data: { rank: 42 },
        billing: { costUsd: RAW_COST, path: backlinksPath },
      };
    });

    const client = createDataforseoClient(billingCustomer);
    const result = await client.backlinks.summary(backlinksInput);

    expect(result).toEqual({ rank: 42 });
    expect(heldDuringCall).toBe(ESTIMATED_CREDITS);
    // The execute + settle chain is registered with the request so a client
    // disconnect after dispatch cannot skip the deduction.
    expect(vi.mocked(waitUntil)).toHaveBeenCalledTimes(1);
    expect((await balances()).monthlyRemaining).toBe(5000 - EXPECTED_CREDITS);
    expect(await charges()).toEqual([
      { pool: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID, credits: EXPECTED_CREDITS },
    ]);
    expect(await openHolds()).toEqual([]);
  });

  it("charges a charged DataForSEO task failure at its cost before rethrowing", async () => {
    await setupHostedMode(5000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new DataforseoChargedTaskError("DataForSEO task failed", {
        costUsd: RAW_COST,
        path: backlinksPath,
      }),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(client.backlinks.summary(backlinksInput)).rejects.toThrow(
      "DataForSEO task failed",
    );

    expect((await balances()).monthlyRemaining).toBe(5000 - EXPECTED_CREDITS);
  });

  it("releases the hold for an unbilled invalid-field failure and throws VALIDATION_ERROR", async () => {
    await setupHostedMode(5000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new DataforseoChargedTaskError(
        "Invalid Field: 'target'.",
        { costUsd: 0, path: backlinksPath },
        true,
      ),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect((await balances()).monthlyRemaining).toBe(5000);
    expect(await openHolds()).toEqual([]);
  });

  it("releases the hold when the provider call fails before billing", async () => {
    await setupHostedMode(5000);
    vi.mocked(fetchBacklinksSummary).mockRejectedValue(
      new AppError("UPSTREAM_UNAVAILABLE", "DataForSEO timed out"),
    );

    const client = createDataforseoClient(billingCustomer);
    await expect(
      client.backlinks.summary(backlinksInput),
    ).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });

    expect(vi.mocked(waitUntil)).toHaveBeenCalledTimes(1);
    expect((await balances()).monthlyRemaining).toBe(5000);
    expect(await openHolds()).toEqual([]);
  });
});

describe("rankCheckBatch", () => {
  const input = {
    keyword: "running shoes",
    keywordId: "kw_1",
    locationCode: 2840,
    languageCode: "en",
    device: "desktop" as const,
    targetDomain: "example.com",
    depth: 10,
  };
  const callEstimate = creditsForProviderUsd(
    dataforseoPricing.serp.rankCheck(input),
  );
  // 2 * ceil(1.28) = 4 credits for two calls, not ceil(2.56) = 3 for their
  // summed cost: each call is credited as it would be unbatched.
  const callCredits = creditsForProviderUsd(0.001);
  const billed = {
    data: {
      keywordId: "kw_1",
      keyword: "running shoes",
      position: 3,
      url: null,
      serpFeatures: [],
    },
    billing: {
      costUsd: 0.001,
      path: ["v3", "serp", "google", "organic", "live", "advanced"],
    },
  };

  it("bills the batch with one hold on the summed estimate and one charge for the billed calls", async () => {
    await setupHostedMode(5000);
    let heldDuringCall: number | undefined;
    vi.mocked(fetchRankCheckSerp)
      .mockImplementationOnce(async () => {
        heldDuringCall = 5000 - (await balances()).monthlyRemaining;
        return billed;
      })
      .mockRejectedValueOnce(
        new AppError("UPSTREAM_UNAVAILABLE", "DataForSEO timed out"),
      )
      .mockResolvedValueOnce(billed);

    const client = createDataforseoClient(billingCustomer);
    const settled = await client.serp.rankCheckBatch([input, input, input]);

    expect(settled.map((outcome) => outcome.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
    expect(heldDuringCall).toBe(3 * callEstimate);
    expect(await charges()).toEqual([
      { pool: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID, credits: 2 * callCredits },
    ]);
    expect((await balances()).monthlyRemaining).toBe(5000 - 2 * callCredits);
  });

  it("splits a batch across monthly and top-up when only both together cover it", async () => {
    // Monthly covers two calls, top-up one: neither covers all three.
    await setupHostedMode(2 * callEstimate, callEstimate);
    vi.mocked(fetchRankCheckSerp).mockResolvedValue(billed);

    const client = createDataforseoClient(billingCustomer);
    const settled = await client.serp.rankCheckBatch([input, input, input]);

    expect(settled.every((outcome) => outcome.status === "fulfilled")).toBe(
      true,
    );
    expect(await charges()).toEqual([
      { pool: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID, credits: 2 * callCredits },
      { pool: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID, credits: callCredits },
    ]);
    expect(await balances()).toEqual({
      monthlyRemaining: 2 * callEstimate - 2 * callCredits,
      topupRemaining: callEstimate - callCredits,
    });
  });
});

describe("mapDataforseoPathToCreditFeature", () => {
  it.each([
    ["v3/dataforseo_labs/google/related_keywords/live", "keyword_research"],
    ["v3/dataforseo_labs/google/keyword_suggestions/live", "keyword_research"],
    ["v3/serp/google/organic/live/regular", "keyword_research"],
    ["v3/keywords_data/google_ads/search_volume/live", "keyword_research"],
    ["v3/dataforseo_labs/google/domain_rank_overview/live", "domain_overview"],
    ["v3/dataforseo_labs/google/ranked_keywords/live", "domain_overview"],
    ["v3/dataforseo_labs/google/relevant_pages/live", "domain_overview"],
    ["v3/backlinks/summary/live", "backlinks"],
    ["backlinks/summary", "backlinks"],
    ["v3/backlinks/referring_domains/live", "backlinks"],
    ["v3/on_page/lighthouse/live/json", "site_audit"],
    ["v3/ai_optimization/llm_mentions/search/live", "ai_citations"],
    ["v3/ai_optimization/llm_mentions/aggregated_metrics/live", "ai_citations"],
    ["v3/ai_optimization/llm_mentions/top_pages/live", "ai_citations"],
    [
      "v3/ai_optimization/ai_keyword_data/keywords_search_volume/live",
      "keyword_research",
    ],
    ["v3/ai_optimization/chat_gpt/llm_responses/live", "ai_prompt_responses"],
    ["v3/ai_optimization/claude/llm_responses/live", "ai_prompt_responses"],
    ["v3/ai_optimization/gemini/llm_responses/live", "ai_prompt_responses"],
    ["v3/ai_optimization/perplexity/llm_responses/live", "ai_prompt_responses"],
    ["v3/business_data/business_listings/search/live", "local_seo"],
    ["v3/serp/google/local_finder/live/advanced", "local_seo"],
    ["v3/serp/google/maps/live/advanced", "local_seo"],
  ])("maps %s to %s", (path, feature) => {
    expect(mapDataforseoPathToCreditFeature(path.split("/"))).toBe(feature);
  });
});
