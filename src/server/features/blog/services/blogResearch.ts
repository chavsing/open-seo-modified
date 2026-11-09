import { sortBy } from "remeda";
import { z } from "zod";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { EnsuredProject } from "@/middleware/ensure-user/types";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { mapKeywordItem } from "@/server/features/domain/services/domainKeywordMapper";
import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import { discoverSiteUrls, readPages } from "@/server/lib/scrape";
import { AppError } from "@/server/lib/errors";
import { normalizeKeyword } from "@/shared/blog-quality";

// Paid calls per research run, kept small on purpose: the site's own top
// keywords (100 rows) plus up to three competitors (50 rows each) is about
// $0.08 at DataForSEO. A brief is one 10-result SERP, about $0.002.
const MAX_COMPETITORS = 3;
const OWN_KEYWORD_ROWS = 100;
const COMPETITOR_KEYWORD_ROWS = 50;
const MIN_SEARCH_VOLUME = 20;
const MAX_NEW_TOPICS = 30;

function wordsOf(value: string): string[] {
  return value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** The brand part of a domain, e.g. "acme" for "shop.acme.co.uk". */
function brandLabel(domain: string): string | null {
  const labels = domain.toLowerCase().split(".");
  const label =
    labels.length > 2 && labels.at(-2)!.length <= 3
      ? labels.at(-3)
      : labels.at(-2);
  return label && label.length >= 4 ? label : null;
}

const compact = (value: string) =>
  value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * A search for the competitor itself ("stumptown coffee portland") is not a
 * topic anyone else can win. Compared without spaces, since domains have none:
 * "stumptowncoffee.com" must catch "stumptown" and "town coffee" too.
 */
function isBrandSearch(
  keyword: string,
  competitor: { domain: string; name: string | null },
): boolean {
  const query = compact(keyword);
  const brands = [
    brandLabel(competitor.domain),
    compact(competitor.name ?? ""),
  ].filter((brand): brand is string => Boolean(brand && brand.length >= 4));
  return brands.some(
    (brand) =>
      query.includes(brand) || (query.length >= 6 && brand.includes(query)),
  );
}

function requireDomain(project: EnsuredProject): string {
  if (!project.domain)
    throw new AppError(
      "VALIDATION_ERROR",
      "Add your website to this project first.",
    );
  return project.domain;
}

/**
 * Finds keywords competitors rank on page one for, that the site neither
 * ranks for nor has a page about, and saves them as topic ideas.
 */
export async function findBlogTopics(
  project: EnsuredProject,
  customer: BillingCustomerContext,
): Promise<{ added: number; found: number }> {
  const domain = requireDomain(project);
  const competitors = (
    await ProjectContextRepository.listCompetitors(project.id)
  ).slice(0, MAX_COMPETITORS);
  if (competitors.length === 0)
    throw new AppError(
      "VALIDATION_ERROR",
      "Add at least one competitor on the Context page first. Topic ideas come from what they rank for.",
    );

  const client = createDataforseoClient({ ...customer, projectId: project.id });
  const market = {
    locationCode: project.locationCode,
    languageCode: project.languageCode,
    creditFeature: "keyword_research" as const,
  };

  const [own, siteUrls] = await Promise.all([
    client.domain.rankedKeywords({
      ...market,
      target: domain,
      limit: OWN_KEYWORD_ROWS,
      orderBy: ["ranked_serp_element.serp_item.etv,desc"],
      filters: [["ranked_serp_element.serp_item.rank_absolute", "<=", 30]],
    }),
    // Free: the sitemap catches pages too new or too weak to rank yet.
    discoverSiteUrls(domain, 500),
  ]);
  const covered = new Set(
    own.items
      .map((item) => mapKeywordItem(item)?.keyword)
      .filter((keyword): keyword is string => Boolean(keyword))
      .map(normalizeKeyword),
  );
  const slugWords = siteUrls.urls.map((url) => {
    try {
      return new Set(wordsOf(new URL(url).pathname));
    } catch {
      return new Set<string>();
    }
  });
  const hasPageFor = (keyword: string) => {
    const needles = wordsOf(keyword).filter((word) => word.length > 2);
    return (
      needles.length > 0 &&
      slugWords.some((slug) => needles.every((word) => slug.has(word)))
    );
  };

  const candidates = new Map<
    string,
    {
      keyword: string;
      searchVolume: number | null;
      keywordDifficulty: number | null;
      competitorDomain: string;
      competitorUrl: string | null;
      competitorPosition: number | null;
    }
  >();
  for (const competitor of competitors) {
    const ranked = await client.domain.rankedKeywords({
      ...market,
      target: competitor.domain,
      limit: COMPETITOR_KEYWORD_ROWS,
      orderBy: ["ranked_serp_element.serp_item.etv,desc"],
      filters: [
        ["ranked_serp_element.serp_item.rank_absolute", "<=", 10],
        "and",
        ["keyword_data.keyword_info.search_volume", ">=", MIN_SEARCH_VOLUME],
      ],
    });
    for (const item of ranked.items) {
      const mapped = mapKeywordItem(item);
      if (!mapped) continue;
      const keyword = normalizeKeyword(mapped.keyword);
      if (isBrandSearch(keyword, competitor)) continue;
      if (covered.has(keyword) || hasPageFor(keyword)) continue;
      const existing = candidates.get(keyword);
      if (
        existing &&
        (existing.competitorPosition ?? 100) <= (mapped.position ?? 100)
      )
        continue;
      candidates.set(keyword, {
        keyword,
        searchVolume: mapped.searchVolume,
        keywordDifficulty: mapped.keywordDifficulty,
        competitorDomain: competitor.domain,
        competitorUrl: mapped.url,
        competitorPosition: mapped.position,
      });
    }
  }

  const known = new Set(
    (await BlogRepository.listTopics(project.id)).map((topic) => topic.keyword),
  );
  const ranked = sortBy(
    [...candidates.values()],
    [(row) => row.searchVolume ?? 0, "desc"],
  );
  const fresh = ranked.filter((row) => !known.has(row.keyword));
  const createdAt = new Date().toISOString();
  await BlogRepository.upsertTopics([
    // Refresh numbers on ideas already saved, then add the best new ones.
    ...ranked
      .filter((row) => known.has(row.keyword))
      .map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        projectId: project.id,
        createdAt,
      })),
    ...fresh.slice(0, MAX_NEW_TOPICS).map((row) => ({
      ...row,
      id: crypto.randomUUID(),
      projectId: project.id,
      createdAt,
    })),
  ]);
  return {
    added: Math.min(fresh.length, MAX_NEW_TOPICS),
    found: ranked.length,
  };
}

const peopleAlsoAskSchema = z.object({
  type: z.literal("people_also_ask"),
  items: z.array(z.object({ title: z.string().nullish() })).nullish(),
});
const relatedSearchesSchema = z.object({
  type: z.literal("related_searches"),
  items: z.array(z.string()).nullish(),
});

function targetWordCount(counts: number[]): number {
  if (counts.length === 0) return 1500;
  const sorted = sortBy(counts, (count) => count);
  const median = sorted[Math.floor(sorted.length / 2)];
  return Math.min(2500, Math.max(1000, Math.round((median * 1.1) / 100) * 100));
}

function shorten(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function titleCase(value: string): string {
  return value.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

/**
 * Builds the research brief for one topic from the live top 10 and saves it as
 * a new article. Returns the existing article when the topic already has one.
 */
export async function createBlogBrief(
  project: EnsuredProject,
  topicId: string,
  customer: BillingCustomerContext,
): Promise<{ articleId: string }> {
  const domain = requireDomain(project);
  const topic = await BlogRepository.getTopic(project.id, topicId);
  if (!topic) throw new AppError("NOT_FOUND", "That topic no longer exists.");
  const existing = await BlogRepository.getArticleForTopic(
    project.id,
    topic.id,
  );
  if (existing) return { articleId: existing.id };

  const client = createDataforseoClient({ ...customer, projectId: project.id });
  const serp = await client.serp.live({
    keyword: topic.keyword,
    locationCode: project.locationCode,
    languageCode: project.languageCode,
    depth: 10,
    creditFeature: "keyword_research",
  });
  const organic = serp
    .filter((item) => item.type === "organic" && item.url)
    .slice(0, 10);
  const questions = serp.flatMap((item) => {
    const parsed = peopleAlsoAskSchema.safeParse(item);
    return parsed.success
      ? (parsed.data.items ?? []).flatMap((q) => (q.title ? [q.title] : []))
      : [];
  });
  const related = serp.flatMap((item) => {
    const parsed = relatedSearchesSchema.safeParse(item);
    return parsed.success ? (parsed.data.items ?? []) : [];
  });
  // Free: read the top three pages to size the article against them.
  const pages = await readPages(
    organic.slice(0, 3).flatMap((item) => (item.url ? [item.url] : [])),
    3,
  );
  const wordCounts = pages.pages.map(
    (page) => page.text.split(/\s+/).filter(Boolean).length,
  );
  const target = targetWordCount(wordCounts);

  const brief = [
    `- **Keyword:** ${topic.keyword}`,
    `- **Monthly searches:** ${topic.searchVolume?.toLocaleString("en-US") ?? "unknown"}`,
    `- **Difficulty:** ${topic.keywordDifficulty ?? "unknown"} / 100`,
    `- **Target length:** about ${target} words`,
    `- **Found because:** ${topic.competitorDomain} ranks #${topic.competitorPosition ?? "?"} for it`,
    "",
    "## What ranks now",
    ...organic.map(
      (item, index) =>
        `${index + 1}. ${item.title ?? item.url} (${item.domain ?? ""})${item.description ? `\n   ${shorten(item.description, 160)}` : ""}`,
    ),
    "",
    "## Questions people ask",
    ...(questions.length ? questions.map((q) => `- ${q}`) : ["- None shown"]),
    "",
    "## Related searches",
    ...(related.length ? related.map((r) => `- ${r}`) : ["- None shown"]),
    "",
    "## Must include",
    "- The keyword in the title, the first 100 words and a section heading",
    `- At least one link to a relevant page on ${domain}`,
    "- Answers to the questions above, in your own words",
  ].join("\n");

  const now = new Date().toISOString();
  await BlogRepository.insertArticle({
    id: crypto.randomUUID(),
    projectId: project.id,
    topicId: topic.id,
    keyword: topic.keyword,
    title: titleCase(topic.keyword),
    brief,
    status: "brief",
    createdAt: now,
    updatedAt: now,
  });
  await BlogRepository.setTopicStatus(project.id, topic.id, "used");
  // Re-read: a concurrent request may have inserted first (unique topic_id).
  const saved = await BlogRepository.getArticleForTopic(project.id, topic.id);
  if (!saved) throw new AppError("INTERNAL_ERROR");
  return { articleId: saved.id };
}
