import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { QueryError } from "@/client/components/QueryState";
import { Skeleton } from "@/client/components/ui/skeleton";
import { cn } from "cn";
import {
  getBlogSettings,
  listBlogArticles,
  listBlogTopics,
} from "@/serverFunctions/blog";
import { blogKeys } from "./blogQueries";

// What went out and when the next automatic articles are due: last week, this
// week and the three after, Monday first, in the browser's timezone. The
// automatic writer picks its topic when it writes, so future days show a slot,
// and the likely topics are listed under the calendar.

const DAY_MS = 24 * 60 * 60_000;
const WEEKS = 5;
const LIKELY_TOPICS = 3;

type Entry = {
  key: string;
  label: string;
  kind: "published" | "draft" | "due";
  articleId?: string;
};

const dayKey = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

function calendarStart(today: Date) {
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  // Back to Monday, then one more week.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7);
  return start;
}

/** Due times of the automatic articles from the next one on, until `end`. */
function dueTimes(
  nextPostAt: string | null,
  postsPerWeek: number,
  now: Date,
  end: Date,
) {
  if (!nextPostAt || postsPerWeek <= 0) return [];
  const interval = (7 * DAY_MS) / postsPerWeek;
  // An overdue article is written at the next run, so it shows today.
  const times = [Math.max(Date.parse(nextPostAt), now.getTime())];
  while (times[times.length - 1] + interval < end.getTime())
    times.push(times[times.length - 1] + interval);
  return times.map((time) => new Date(time));
}

export function BlogCalendarCard({ projectId }: { projectId: string }) {
  const settingsQuery = useQuery({
    queryKey: blogKeys.settings(projectId),
    queryFn: () => getBlogSettings({ data: { projectId } }),
  });
  const articlesQuery = useQuery({
    queryKey: blogKeys.articles(projectId),
    queryFn: () => listBlogArticles({ data: { projectId } }),
  });
  const topicsQuery = useQuery({
    queryKey: blogKeys.topics(projectId),
    queryFn: () => listBlogTopics({ data: { projectId } }),
  });

  if (
    settingsQuery.isPending ||
    articlesQuery.isPending ||
    topicsQuery.isPending
  )
    return <Skeleton className="h-96 w-full" />;
  const failed = [settingsQuery, articlesQuery, topicsQuery].find(
    (query) => query.isError,
  );
  if (failed)
    return (
      <QueryError
        cause={failed.error}
        fallback="Couldn't load the calendar. Please try again."
        onRetry={() => void failed.refetch()}
        isRetrying={failed.isFetching}
      />
    );
  const settings = settingsQuery.data;
  const now = new Date();
  const start = calendarStart(now);
  const end = new Date(start.getTime() + WEEKS * 7 * DAY_MS);
  const days = Array.from({ length: WEEKS * 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });

  const entries = new Map<string, Entry[]>();
  const add = (date: Date, entry: Entry) =>
    entries.set(dayKey(date), [...(entries.get(dayKey(date)) ?? []), entry]);
  for (const article of articlesQuery.data ?? []) {
    if (article.status === "published")
      add(new Date(article.publishedAt ?? article.updatedAt), {
        key: article.id,
        label: article.title,
        kind: "published",
        articleId: article.id,
      });
    else if (article.status === "wp_draft")
      add(new Date(article.updatedAt), {
        key: article.id,
        label: article.title,
        kind: "draft",
        articleId: article.id,
      });
  }
  const automaticOn =
    Boolean(settings?.wordpress) && settings!.postsPerWeek > 0;
  if (automaticOn)
    for (const due of dueTimes(
      settings!.nextPostAt,
      settings!.postsPerWeek,
      now,
      end,
    ))
      add(due, {
        key: `due-${due.getTime()}`,
        label: "Automatic article",
        kind: "due",
      });

  const likely = (topicsQuery.data ?? [])
    .filter((topic) => topic.status === "idea")
    .slice(0, LIKELY_TOPICS);

  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-sm text-muted-foreground">
        {automaticOn
          ? `About ${settings!.postsPerWeek} automatic ${settings!.postsPerWeek === 1 ? "article" : "articles"} a week. Each one picks its topic when it is written, from the best unused topic ideas.`
          : "Automatic writing is off, so only articles you send show here. Turn it on under Settings."}
      </p>

      <div className="hidden overflow-hidden rounded-xl border md:grid md:grid-cols-7">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => (
          <div
            key={name}
            className="border-b bg-muted/40 px-2 py-1.5 text-xs font-medium text-muted-foreground"
          >
            {name}
          </div>
        ))}
        {days.map((day) => (
          <div
            key={dayKey(day)}
            className={cn(
              "min-h-24 border-b border-l px-2 py-1.5 first:border-l-0 [&:nth-child(7n+1)]:border-l-0",
              day <
                new Date(now.getFullYear(), now.getMonth(), now.getDate()) &&
                "bg-muted/20",
            )}
          >
            <div
              className={cn(
                "mb-1 text-xs text-muted-foreground",
                dayKey(day) === dayKey(now) && "font-semibold text-foreground",
              )}
            >
              {day.getDate() === 1 || day.getTime() === start.getTime()
                ? day.toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : day.getDate()}
            </div>
            <div className="space-y-1">
              {(entries.get(dayKey(day)) ?? []).map((entry) => (
                <CalendarEntry
                  key={entry.key}
                  projectId={projectId}
                  entry={entry}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <ul className="space-y-3 md:hidden">
        {days
          .filter((day) => entries.has(dayKey(day)))
          .map((day) => (
            <li key={dayKey(day)} className="rounded-xl border p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {day.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <div className="space-y-1">
                {entries.get(dayKey(day))!.map((entry) => (
                  <CalendarEntry
                    key={entry.key}
                    projectId={projectId}
                    entry={entry}
                  />
                ))}
              </div>
            </li>
          ))}
        {entries.size === 0 ? (
          <li className="rounded-xl border p-3 text-sm text-muted-foreground">
            Nothing sent or planned in these five weeks.
          </li>
        ) : null}
      </ul>

      {automaticOn ? (
        <p className="text-sm text-muted-foreground">
          {likely.length
            ? `Likely next topics: ${likely.map((topic) => topic.keyword).join(", ")}.`
            : "No unused topic ideas left. The next automatic article researches new ones first."}
        </p>
      ) : null}
    </div>
  );
}

const ENTRY_STYLES = {
  published: "bg-success/15 text-success",
  draft: "bg-warning/15 text-warning-foreground dark:text-warning",
  due: "border border-dashed border-border text-muted-foreground",
} as const;

const ENTRY_PREFIX = {
  published: "Published: ",
  draft: "Draft: ",
  due: "",
} as const;

function CalendarEntry({
  projectId,
  entry,
}: {
  projectId: string;
  entry: Entry;
}) {
  const className = cn(
    "block truncate rounded-md px-1.5 py-0.5 text-xs",
    ENTRY_STYLES[entry.kind],
  );
  const text = `${ENTRY_PREFIX[entry.kind]}${entry.label}`;
  return entry.articleId ? (
    <Link
      to="/p/$projectId/blog/$articleId"
      params={{ projectId, articleId: entry.articleId }}
      className={cn(className, "hover:underline")}
      title={text}
    >
      {text}
    </Link>
  ) : (
    <span className={className} title={text}>
      {text}
    </span>
  );
}
