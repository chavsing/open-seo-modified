import { BlogRepository } from "@/server/features/blog/repositories/BlogRepository";
import {
  createBlogBrief,
  findBlogTopics,
} from "@/server/features/blog/services/blogResearch";
import { BlogService } from "@/server/features/blog/services/BlogService";
import {
  chooseBlogTopic,
  writeBlogArticle,
} from "@/server/features/blog/services/blogWriter";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";

// An article takes one to two minutes, so a tick writes a few, one site at a
// time, and stops starting new ones near the deadline. Sites left over stay
// due for the next tick, oldest first.
const SITES_PER_TICK = 3;
const TICK_DEADLINE_MS = 8 * 60_000;
const WEEK_MS = 7 * 24 * 60 * 60_000;
const TOPIC_CANDIDATES = 25;

/** The next due time after `observed`, skipping any already in the past. */
function nextPostAfter(observed: string, postsPerWeek: number, now: number) {
  const interval = Math.round(WEEK_MS / postsPerWeek);
  let next = new Date(observed).getTime() + interval;
  while (next <= now) next += interval;
  return new Date(next).toISOString();
}

/** Our own wording for why a step failed; never a raw error code. */
function reason(error: unknown): string {
  if (error instanceof AppError) {
    if (error.code === "INSUFFICIENT_CREDITS")
      return "This account is out of usage credits.";
    if (error.message !== error.code) return error.message;
  }
  return "Something went wrong.";
}

type SiteProject = NonNullable<
  Awaited<ReturnType<typeof ProjectRepository.getProjectForOrganization>>
>;

/**
 * The AI picks from the most searched ideas and drops other brands' names and
 * repeats, which are marked skipped so they aren't offered again. When none
 * are left, new ideas are researched once.
 */
async function pickTopic(
  project: SiteProject,
  customer: Parameters<typeof findBlogTopics>[1],
) {
  for (let round = 0; round < 2; round++) {
    const ideas = await BlogRepository.listTopicIdeas(
      project.id,
      TOPIC_CANDIDATES,
    );
    if (ideas.length) {
      const { choice, reject } = await chooseBlogTopic(
        project,
        {
          candidates: ideas.map((idea) => ({
            keyword: idea.keyword,
            searches: idea.searchVolume,
          })),
        },
        customer,
      );
      for (const idea of ideas)
        if (reject.includes(idea.keyword))
          await BlogRepository.setTopicStatus(project.id, idea.id, "skipped");
      const chosen = ideas.find((idea) => idea.keyword === choice);
      if (chosen) return chosen;
    }
    if (round === 0) await findBlogTopics(project, customer);
  }
  return null;
}

/**
 * One automatic article for one site: the best unused topic (researching new
 * ones when none are left), its brief, the article, then WordPress. It goes
 * live only when the site is on Auto-publish and the article passed all 11
 * checks and a 10/10 AI review; anything else is sent as a draft.
 */
async function postForSite(projectId: string, organizationId: string) {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) return null;
  const settings = await BlogService.getSettings(projectId);
  if (!settings.wordpress)
    return "Paused: connect your WordPress site to post automatically.";
  const customer = {
    organizationId,
    userId: "system",
    userEmail: "system@openseo.so",
    projectId,
  };

  const topic = await pickTopic(project, customer);
  if (!topic)
    return "Paused: no new topic ideas. Add more competitors on the Context page.";

  const { articleId } = await createBlogBrief(project, topic.id, customer);
  const article = await writeBlogArticle(
    project,
    { articleId, replace: true },
    customer,
  );
  const publish =
    settings.publishMode === "auto" &&
    article.passedAllChecks &&
    article.aiScore === 10;
  const written = `Wrote "${article.title}" (AI score ${article.aiScore}/10)`;
  try {
    await BlogService.sendToWordpress(project, { articleId, publish });
  } catch (error) {
    return `${written}, but sending it to WordPress failed: ${reason(error)} It's saved in the Blog Generator.`;
  }
  if (publish) return `${written} and published it.`;
  if (settings.publishMode === "auto")
    return `${written} and sent it as a draft, because it didn't reach 10/10 on every check.`;
  return `${written} and sent it to WordPress as a draft.`;
}

/** Cron body: write the next article for every site whose turn has come. */
export async function runScheduledBlogPosts() {
  const deadline = Date.now() + TICK_DEADLINE_MS;
  const due = await BlogRepository.listDueAutoPosts(
    new Date().toISOString(),
    SITES_PER_TICK,
  );
  for (const site of due) {
    if (Date.now() >= deadline) break;
    // Unreachable: the due query only returns sites with a next post.
    if (!site.nextPostAt) continue;
    // Advance the schedule first, so a site that fails waits for its next
    // turn instead of retrying every five minutes and spending credits.
    const claimed = await BlogRepository.claimDueAutoPost({
      projectId: site.projectId,
      observedNextPostAt: site.nextPostAt,
      nextPostAt: nextPostAfter(site.nextPostAt, site.postsPerWeek, Date.now()),
    });
    if (!claimed) continue;
    let message: string | null;
    try {
      message = await postForSite(site.projectId, site.organizationId);
    } catch (error) {
      if (!(error instanceof AppError))
        console.error("[blog] automatic article failed", {
          projectId: site.projectId,
          error,
        });
      message = `Skipped: ${reason(error)} It will try again at the next scheduled time.`;
    }
    if (message)
      await BlogRepository.upsertSettings(site.projectId, {
        lastRunMessage: message,
      }).catch(() => undefined);
  }
}
