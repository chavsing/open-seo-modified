/** Sidebar note for a view-only member, so missing tools don't look broken. */
export function ViewOnlyNote() {
  return (
    <p className="mx-3 mb-3 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-sidebar-foreground">
        View-only access.
      </span>{" "}
      You can look at this workspace&rsquo;s results, but not change anything or
      run new research.
    </p>
  );
}
