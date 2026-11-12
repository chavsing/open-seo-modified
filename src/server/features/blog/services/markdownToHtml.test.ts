import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdownToHtml";

describe("markdownToHtml", () => {
  it("sends a picture as a WordPress image that fits the column", () => {
    const url = "https://acme.com/wp-content/uploads/kettle.jpg";

    const html = markdownToHtml(
      `Intro.\n\n![Kettle](${url})`,
      new Map([[url, 42]]),
    );

    expect(html).toContain(
      `<figure class="wp-block-image size-large"><img src="${url}" alt="Kettle" class="wp-image-42" style="max-width:100%;height:auto"/></figure>`,
    );
    expect(html).toContain("<p>Intro.</p>");
  });
});
