import type { BillingCustomerContext } from "@/server/billing/subscription";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";

// "Which keywords does a competitor rank for that my site doesn't": one
// DataForSEO domain_intersection call, most searched first.

const GAP_ROWS = 100;
// Page one and two: a competitor at #45 isn't a gap worth writing for.
const MAX_COMPETITOR_POSITION = 20;

export async function findKeywordGap(
  input: {
    projectId: string;
    yourDomain: string;
    competitor: string;
    locationCode: number;
    languageCode: string;
  },
  customer: BillingCustomerContext,
) {
  if (input.yourDomain === input.competitor)
    throw new AppError(
      "VALIDATION_ERROR",
      "Pick a competitor other than your own site.",
    );
  const client = createDataforseoClient({
    ...customer,
    projectId: input.projectId,
  });
  const items = await client.domain.keywordGap({
    target1: input.competitor,
    target2: input.yourDomain,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    limit: GAP_ROWS,
    maxPosition: MAX_COMPETITOR_POSITION,
    creditFeature: "keyword_research",
  });
  return items.flatMap((item) => {
    const keyword = item.keyword_data?.keyword;
    if (!keyword) return [];
    const info = item.keyword_data?.keyword_info;
    const position = item.first_domain_serp_element?.rank_absolute;
    return [
      {
        keyword,
        searchVolume: info?.search_volume ?? null,
        keywordDifficulty:
          item.keyword_data?.keyword_properties?.keyword_difficulty ??
          info?.keyword_difficulty ??
          null,
        competitorPosition: position != null ? Math.round(position) : null,
        competitorUrl: item.first_domain_serp_element?.url ?? null,
      },
    ];
  });
}
