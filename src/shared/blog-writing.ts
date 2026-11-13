// AI writing runs in the background and marks the article while it does. A
// mark older than this belongs to a job that died, so the article page stops
// waiting and writing can start again.
export const WRITING_STALE_MS = 15 * 60_000;

export function isWriting(writingStartedAt: string | null | undefined) {
  return (
    Boolean(writingStartedAt) &&
    Date.now() - Date.parse(writingStartedAt ?? "") < WRITING_STALE_MS
  );
}
