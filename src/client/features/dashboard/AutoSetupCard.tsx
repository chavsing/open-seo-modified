import { Link } from "@tanstack/react-router";
import { CircleAlert, Loader2, Sparkles } from "lucide-react";
import type { DashboardActivation } from "@/server/features/dashboard/services/DashboardService";

type AutoSetup = NonNullable<DashboardActivation["autoSetup"]>;

/**
 * What the app set up on its own when this site was added. Shown on the
 * dashboard in place of the Get started checklist.
 */
export function AutoSetupCard({
  projectId,
  setup,
}: {
  projectId: string;
  setup: AutoSetup;
}) {
  const results = [
    {
      count: setup.contextSections,
      label: "Context sections filled in from your website",
      to: "/p/$projectId/context" as const,
    },
    {
      count: setup.competitors,
      label: "competitors found",
      to: "/p/$projectId/context" as const,
    },
    {
      count: setup.topicIdeas,
      label: "blog topic ideas",
      to: "/p/$projectId/blog" as const,
    },
    {
      count: setup.trackedKeywords,
      label: "searches tracked weekly in Rank Tracking",
      to: "/p/$projectId/rank-tracking" as const,
    },
  ];

  return (
    <section
      aria-label="Site setup"
      className="rounded-xl border border-border bg-card px-5 py-5 sm:px-6"
    >
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {setup.status === "running" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : setup.status === "failed" ? (
          <CircleAlert className="size-4 text-destructive" />
        ) : (
          <Sparkles className="size-4" />
        )}
        {setup.status === "running"
          ? "Setting up your site"
          : setup.status === "failed"
            ? "Setup didn't finish"
            : "Your site is set up"}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {setup.status === "running" ? (
          "We're reading your website, finding competitors and topic ideas, and starting rank tracking. This takes a minute or two; you can keep working."
        ) : setup.status === "failed" ? (
          <>
            Anything below was still set up. To try again, use Set up from your
            website on the{" "}
            <Link
              to="/p/$projectId/context"
              params={{ projectId }}
              className="underline underline-offset-2"
            >
              Context page
            </Link>
            .
          </>
        ) : (
          "We read your website and set up the basics. Change anything you like."
        )}
      </p>
      {setup.status === "failed" && setup.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {setup.error}
        </p>
      ) : null}
      {setup.status === "running" ? null : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {results.map((result) => (
            <li key={result.label}>
              <Link
                to={result.to}
                params={{ projectId }}
                className="flex items-baseline gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="text-base font-semibold tabular-nums">
                  {result.count}
                </span>
                <span className="text-muted-foreground">{result.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
