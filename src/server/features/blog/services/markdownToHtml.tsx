import { renderToStaticMarkup } from "react-dom/server";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Article markdown as the HTML WordPress stores. react-markdown escapes raw
 * HTML instead of passing it through, so model or pasted output can't inject
 * script tags into the customer's site.
 *
 * A picture on its own line becomes a WordPress image figure. Themes don't
 * all size a bare <img> in post text, so it also says to fit the column, and
 * its media id (wp-image-N) lets WordPress serve smaller sizes to phones.
 */
export function markdownToHtml(
  markdown: string,
  mediaIds: ReadonlyMap<string, number> = new Map(),
): string {
  const components: Components = {
    p: ({ node, children }) => {
      const only = node?.children.length === 1 ? node.children[0] : null;
      return only?.type === "element" && only.tagName === "img" ? (
        <figure className="wp-block-image size-large">{children}</figure>
      ) : (
        <p>{children}</p>
      );
    },
    img: ({ src, alt }) => {
      const id = typeof src === "string" ? mediaIds.get(src) : undefined;
      return (
        <img
          src={src}
          alt={alt ?? ""}
          className={id ? `wp-image-${id}` : undefined}
          style={{ maxWidth: "100%", height: "auto" }}
        />
      );
    },
  };
  return renderToStaticMarkup(
    <Markdown remarkPlugins={[remarkGfm]} components={components}>
      {markdown}
    </Markdown>,
  );
}
