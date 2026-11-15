import { z } from "zod";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoItemsTask,
} from "@/server/lib/dataforseo/envelope";

const keywordGapItemSchema = z
  .object({
    keyword_data: z
      .object({
        keyword: z.string().nullable().optional(),
        keyword_info: z
          .object({
            search_volume: z.number().nullable().optional(),
            keyword_difficulty: z.number().nullable().optional(),
          })
          .passthrough()
          .nullable()
          .optional(),
        keyword_properties: z
          .object({ keyword_difficulty: z.number().nullable().optional() })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    first_domain_serp_element: z
      .object({
        url: z.string().nullable().optional(),
        rank_absolute: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

type KeywordGapItem = z.infer<typeof keywordGapItemSchema>;

/**
 * Keywords `target1` ranks for and `target2` doesn't (domain_intersection
 * with intersections off), most searched first.
 */
export async function fetchKeywordGap(input: {
  target1: string;
  target2: string;
  locationCode: number;
  languageCode: string;
  limit: number;
  maxPosition: number;
}): Promise<DataforseoApiResponse<KeywordGapItem[]>> {
  const response = await dataforseoPost<DataforseoItemsTask<unknown>>(
    "/v3/dataforseo_labs/google/domain_intersection/live",
    [
      {
        target1: input.target1,
        target2: input.target2,
        location_code: input.locationCode,
        language_code: input.languageCode,
        intersections: false,
        limit: input.limit,
        order_by: ["keyword_data.keyword_info.search_volume,desc"],
        filters: [
          "first_domain_serp_element.rank_absolute",
          "<=",
          input.maxPosition,
        ],
      },
    ],
  );
  const task = assertOk(response);
  return {
    data: parseTaskItems(
      "google-domain-intersection-live",
      task,
      keywordGapItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}
