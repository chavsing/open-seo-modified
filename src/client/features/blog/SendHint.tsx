import { Link } from "@tanstack/react-router";

/** Under the editor's send buttons: why sending or publishing is off. */
export function SendHint({
  projectId,
  showConnect,
  showLocked,
}: {
  projectId: string;
  showConnect: boolean;
  showLocked: boolean;
}) {
  if (showConnect)
    return (
      <p className="text-sm text-muted-foreground">
        Connect your WordPress site in the{" "}
        <Link
          to="/p/$projectId/blog"
          params={{ projectId }}
          search={{ tab: "settings" }}
          className="underline underline-offset-2 hover:text-foreground"
        >
          blog settings
        </Link>{" "}
        to send articles.
      </p>
    );
  if (showLocked)
    return (
      <p className="text-sm text-muted-foreground">
        Publishing unlocks when every quality check passes and the AI review
        gives the saved text 10/10. You can still send it as a draft.
      </p>
    );
  return null;
}
