import { ProjectContextRepository } from "@/server/features/project-context/repositories/ProjectContextRepository";
import { discoverSiteUrls } from "@/server/lib/scrape";

// A long Context section is cut so it can't crowd out the brief.
const MAX_SECTION_CHARS = 3_000;
const MAX_KEY_PAGES = 20;
const MAX_SITE_LINKS = 40;

/**
 * What the project's Context page says about the business, so articles can be
 * specific to it instead of advice that could be on any site. Null when the
 * page is empty.
 */
export async function businessContext(projectId: string) {
  const [sections, keyPages] = await Promise.all([
    ProjectContextRepository.listSections(projectId),
    ProjectContextRepository.listKeyPages(projectId),
  ]);
  const section = (key: string) =>
    sections
      .find((row) => row.key === key)
      ?.content.trim()
      .slice(0, MAX_SECTION_CHARS) || null;
  const context = {
    overview: section("business_overview"),
    positioning: section("positioning"),
    writingPreferences: section("writing_preferences"),
    keyPages: keyPages
      .slice(0, MAX_KEY_PAGES)
      .map((page) => ({ url: page.url, topic: page.topic })),
  };
  const empty =
    !context.overview &&
    !context.positioning &&
    !context.writingPreferences &&
    context.keyPages.length === 0;
  return empty ? null : context;
}

export type BusinessContext = Awaited<ReturnType<typeof businessContext>>;

/** Pages the article may link to: the site's own URLs, never guessed ones. */
export async function sitePages(domain: string): Promise<string[]> {
  const found = await discoverSiteUrls(domain, 200).catch(() => ({
    urls: [],
  }));
  const own = found.urls.filter((url) => {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "");
      return host === domain.replace(/^www\./, "") && !url.includes("?");
    } catch {
      return false;
    }
  });
  return own.length ? own.slice(0, MAX_SITE_LINKS) : [`https://${domain}/`];
}
