// Links in written articles to the business's own site.

/** Compares page addresses the way a visitor would: no scheme, www or end slash. */
export const linkKey = (url: string) =>
  url
    .replace(/^https?:\/\/(www\.)?/i, "")
    .replace(/#.*$/, "")
    .replace(/\/+$/, "")
    .toLowerCase();

/**
 * The model is told never to invent a URL, but a prompt can't guarantee it: a
 * link to the business's own site that isn't a real page becomes plain text.
 * Links to other sites and pictures are left alone.
 */
export function keepKnownOwnLinks(
  content: string,
  domain: string,
  linkable: Set<string>,
) {
  const own = domain.replace(/^www\./, "");
  return content.replace(
    /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (link, text: string, url: string) => {
      let host: string;
      try {
        host = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return text;
      }
      const isOwn = host === own || host.endsWith(`.${own}`);
      return isOwn && !linkable.has(linkKey(url)) ? text : link;
    },
  );
}
