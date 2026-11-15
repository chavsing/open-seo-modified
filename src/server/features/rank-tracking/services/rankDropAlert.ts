import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { sendNoticeEmail } from "@/server/email/loops";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// After a scheduled check, tell the organization's owners which keywords
// dropped, in one email per run. Only keywords that were on Google's first two
// pages count, and only a fall of several places, so normal day to day wobble
// stays quiet. Best effort: a failed email never fails the run.

const WATCHED_POSITION = 20;
const DROP_PLACES = 5;
const LISTED_DROPS = 5;

type Snapshot = {
  trackingKeywordId: string;
  device: string;
  keyword: string;
  position: number | null;
};

export async function alertRankDrops(input: {
  organizationId: string;
  projectId: string;
  domain: string;
  /** Latest positions before this run. */
  before: Snapshot[];
  /** This run's positions. */
  after: Snapshot[];
}) {
  const previous = new Map(
    input.before.map((s) => [`${s.trackingKeywordId}:${s.device}`, s.position]),
  );
  const drops = input.after.flatMap((s) => {
    const was = previous.get(`${s.trackingKeywordId}:${s.device}`);
    if (was == null || was > WATCHED_POSITION) return [];
    if (s.position != null && s.position - was < DROP_PLACES) return [];
    return [{ ...s, was, fall: (s.position ?? 101) - was }];
  });
  drops.sort((a, b) => b.fall - a.fall);
  if (drops.length === 0) return;

  const listed = drops.slice(0, LISTED_DROPS).map((d) => {
    const now =
      d.position == null ? "is no longer found" : `fell to ${d.position}`;
    return `"${d.keyword}" was at ${d.was} and ${now} (${d.device})`;
  });
  const more =
    drops.length > LISTED_DROPS
      ? ` And ${drops.length - LISTED_DROPS} more.`
      : "";
  const title = `Rankings dropped for ${input.domain}`;
  const message = `Your latest automatic rank check for ${input.domain} found ${drops.length === 1 ? "a keyword" : `${drops.length} keywords`} that dropped on Google: ${listed.join("; ")}.${more}`;

  try {
    const appUrl = (await getOptionalEnvValue("BETTER_AUTH_URL")) ?? "";
    const linkUrl = `${appUrl.replace(/\/$/, "")}/p/${input.projectId}/rank-tracking`;
    for (const email of await AuthRepository.listOwnerEmails(
      input.organizationId,
    ))
      await sendNoticeEmail({ email, title, message, linkUrl });
  } catch (error) {
    console.error("[rank-check] rank drop email failed", {
      organizationId: input.organizationId,
      error,
    });
  }
}
