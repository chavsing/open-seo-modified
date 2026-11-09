import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Article markdown as the HTML WordPress stores. react-markdown escapes raw
 * HTML instead of passing it through, so model or pasted output can't inject
 * script tags into the customer's site.
 */
export function markdownToHtml(markdown: string): string {
  return renderToStaticMarkup(
    <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>,
  );
}
