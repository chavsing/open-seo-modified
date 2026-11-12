import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveWordpressPost } from "./wordpressClient";

const connection = {
  siteUrl: "https://acme.com/",
  username: "editor",
  password: "app-password",
};
const post = {
  postId: null,
  title: "Chemex brewing",
  html: "<p>Hi</p>",
  excerpt: null,
  status: "draft" as const,
};
const saved = {
  id: 7,
  link: "https://acme.com/?p=7",
  status: "draft",
  title: { raw: "Chemex brewing" },
  modified_gmt: new Date().toISOString().slice(0, 19),
};

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown) => new Response(JSON.stringify(body));
const calls = () =>
  fetchMock.mock.calls.map(([url, init]) => {
    const route = new URL(
      url instanceof Request ? url.url : url,
    ).searchParams.get("rest_route");
    return `${init?.method} ${route}`;
  });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

describe("saveWordpressPost", () => {
  it("keeps the post a slow site saved after the create timed out", async () => {
    fetchMock
      .mockResolvedValueOnce(json([]))
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(json([saved]));

    await expect(saveWordpressPost(connection, post)).resolves.toMatchObject({
      id: 7,
    });
    expect(calls()).toEqual([
      "GET /wp/v2/posts",
      "POST /wp/v2/posts",
      "GET /wp/v2/posts",
    ]);
  });

  it("updates a post an earlier failed attempt saved instead of adding another", async () => {
    fetchMock
      .mockResolvedValueOnce(json([saved]))
      .mockResolvedValueOnce(json(saved));

    await saveWordpressPost(connection, post);

    expect(calls()).toEqual(["GET /wp/v2/posts", "POST /wp/v2/posts/7"]);
  });
});
