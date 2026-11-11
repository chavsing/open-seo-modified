import { z } from "zod";
import { AppError } from "@/server/lib/errors";

// Minimal WordPress REST client: verify a login and create or update posts.
// Auth is an application password (WordPress 5.6+) over Basic auth.
//
// Callers pass a site URL that already went through the SSRF guard (see
// BlogService). Requests use `?rest_route=` instead of `/wp-json/`, which works
// whatever the site's permalink setting is, and refuse redirects: following
// one would replay the credentials to a host nobody validated.

const TIMEOUT_MS = 20_000;

export type WordpressConnection = {
  /** Validated site URL, e.g. "https://example.com/" or ".../blog/". */
  siteUrl: string;
  username: string;
  password: string;
};

const wpErrorSchema = z.object({ code: z.string(), message: z.string() });

const wpUserSchema = z.object({
  name: z.string(),
  capabilities: z.record(z.string(), z.boolean()).optional(),
});

const wpPostSchema = z.object({
  id: z.number(),
  link: z.string(),
  status: z.string(),
});

type WordpressPost = z.infer<typeof wpPostSchema>;

function endpoint(siteUrl: string, route: string): string {
  const url = new URL(siteUrl);
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  url.searchParams.set("rest_route", route);
  return url.toString();
}

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

async function request(
  connection: WordpressConnection,
  route: string,
  init: { method: "GET" | "POST"; body?: unknown; query?: string },
): Promise<unknown> {
  let url = endpoint(connection.siteUrl, route);
  if (init.query) url += `&${init.query}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        authorization: basicAuth(connection.username, connection.password),
        accept: "application/json",
        ...(init.body ? { "content-type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Could not reach your WordPress site. Check the address and try again.",
    );
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    throw new AppError(
      "VALIDATION_ERROR",
      location
        ? `Your site redirected to ${new URL(location, url).origin}. Use that address as the site URL.`
        : "Your site answered with a redirect. Check the site URL.",
    );
  }

  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Handled below: a security plugin or host error page answered instead.
  }

  if (!response.ok) {
    const wpError = wpErrorSchema.safeParse(body);
    if (response.status === 401 || response.status === 403)
      throw new AppError(
        "VALIDATION_ERROR",
        "WordPress rejected the username or application password.",
      );
    if (wpError.success && wpError.data.code === "rest_post_invalid_id")
      throw new AppError("NOT_FOUND", "The WordPress post no longer exists.");
    if (wpError.success && wpError.data.code === "rest_no_route")
      throw new AppError(
        "VALIDATION_ERROR",
        "This site's WordPress REST API is turned off. A security plugin may be blocking it.",
      );
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      wpError.success
        ? `WordPress said: ${wpError.data.message.slice(0, 200)}`
        : `Your WordPress site answered with an error (HTTP ${response.status}).`,
    );
  }
  if (body === null)
    throw new AppError(
      "VALIDATION_ERROR",
      "That address didn't answer like a WordPress site. Check the site URL.",
    );
  return body;
}

/** Checks the login works and may publish posts. Returns the display name. */
export async function verifyWordpressLogin(
  connection: WordpressConnection,
): Promise<{ name: string }> {
  const parsed = wpUserSchema.safeParse(
    await request(connection, "/wp/v2/users/me", {
      method: "GET",
      query: "context=edit",
    }),
  );
  if (!parsed.success)
    throw new AppError(
      "VALIDATION_ERROR",
      "That address didn't answer like a WordPress site. Check the site URL.",
    );
  if (parsed.data.capabilities && !parsed.data.capabilities.publish_posts)
    throw new AppError(
      "VALIDATION_ERROR",
      "This WordPress user can't publish posts. Use an Author, Editor or Administrator account.",
    );
  return { name: parsed.data.name };
}

/** Creates a post, or updates `postId` when the article was sent before. */
export async function saveWordpressPost(
  connection: WordpressConnection,
  post: {
    postId: number | null;
    title: string;
    html: string;
    /** The meta description; many SEO plugins fall back to the excerpt. */
    excerpt: string | null;
    status: "draft" | "publish";
  },
): Promise<WordpressPost> {
  const body = {
    title: post.title,
    content: post.html,
    status: post.status,
    ...(post.excerpt ? { excerpt: post.excerpt } : {}),
  };
  let result: unknown;
  try {
    result = await request(
      connection,
      post.postId ? `/wp/v2/posts/${post.postId}` : "/wp/v2/posts",
      { method: "POST", body },
    );
  } catch (error) {
    // Someone deleted the post in WordPress: send it again as a new one.
    if (
      !(post.postId && error instanceof AppError && error.code === "NOT_FOUND")
    )
      throw error;
    result = await request(connection, "/wp/v2/posts", {
      method: "POST",
      body,
    });
  }
  const parsed = wpPostSchema.safeParse(result);
  if (!parsed.success)
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "WordPress accepted the post but sent back an unexpected answer.",
    );
  return parsed.data;
}
