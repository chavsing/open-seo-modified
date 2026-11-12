import { z } from "zod";
import { AppError } from "@/server/lib/errors";

// Minimal WordPress REST client: verify a login, upload pictures, and create
// or update posts.
// Auth is an application password (WordPress 5.6+) over Basic auth.
//
// Callers pass a site URL that already went through the SSRF guard (see
// BlogService). Requests use `?rest_route=` instead of `/wp-json/`, which works
// whatever the site's permalink setting is, and refuse redirects: following
// one would replay the credentials to a host nobody validated.

const TIMEOUT_MS = 20_000;
// Creating a post runs the site's plugins, which can be slow on shared hosts.
const CREATE_TIMEOUT_MS = 60_000;
// How far back a post that WordPress saved during a failed create can be.
const RECOVERY_WINDOW_MS = 10 * 60_000;

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

const wpMediaSchema = z.object({ id: z.number(), source_url: z.string() });

const wpPostListSchema = z.array(
  wpPostSchema.extend({
    title: z.object({ raw: z.string().optional() }),
    modified_gmt: z.string(),
  }),
);

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
  init: {
    method: "GET" | "POST";
    body?: unknown;
    /** A file upload instead of a JSON body. */
    file?: {
      bytes: Uint8Array<ArrayBuffer>;
      mediaType: string;
      filename: string;
    };
    query?: string;
    timeoutMs?: number;
  },
): Promise<unknown> {
  let url = endpoint(connection.siteUrl, route);
  if (init.query) url += `&${init.query}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      redirect: "manual",
      signal: AbortSignal.timeout(init.timeoutMs ?? TIMEOUT_MS),
      headers: {
        authorization: basicAuth(connection.username, connection.password),
        accept: "application/json",
        ...(init.file
          ? {
              "content-type": init.file.mediaType,
              "content-disposition": `attachment; filename="${init.file.filename}"`,
            }
          : init.body
            ? { "content-type": "application/json" }
            : {}),
      },
      body: init.file
        ? init.file.bytes
        : init.body
          ? JSON.stringify(init.body)
          : undefined,
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

/**
 * Uploads a picture to the site's media library. The alt text is set in a
 * second call, as an upload carries only the file; a failure there leaves the
 * picture without alt text rather than failing the send.
 */
export async function uploadWordpressMedia(
  connection: WordpressConnection,
  file: {
    bytes: Uint8Array<ArrayBuffer>;
    mediaType: string;
    filename: string;
    alt: string;
  },
): Promise<{ id: number; url: string }> {
  const parsed = wpMediaSchema.safeParse(
    await request(connection, "/wp/v2/media", {
      method: "POST",
      file,
      timeoutMs: CREATE_TIMEOUT_MS,
    }),
  );
  if (!parsed.success)
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "WordPress accepted the picture but sent back an unexpected answer.",
    );
  if (file.alt)
    await request(connection, `/wp/v2/media/${parsed.data.id}`, {
      method: "POST",
      body: { alt_text: file.alt },
    }).catch(() => undefined);
  return { id: parsed.data.id, url: parsed.data.source_url };
}

/**
 * A post with this exact title that WordPress saved since `since`, if any.
 * A slow site can save a post and answer after the timeout, so the app
 * reports a failure; looking first keeps a retry from making a duplicate.
 */
async function findRecentPost(
  connection: WordpressConnection,
  title: string,
  since: number,
): Promise<WordpressPost | null> {
  const query = new URLSearchParams({
    search: title,
    status: "draft,pending,future,private,publish",
    context: "edit",
    orderby: "modified",
    order: "desc",
    per_page: "10",
  });
  const parsed = wpPostListSchema.safeParse(
    await request(connection, "/wp/v2/posts", {
      method: "GET",
      query: query.toString(),
    }),
  );
  if (!parsed.success) return null;
  return (
    parsed.data.find(
      (candidate) =>
        candidate.title.raw === title &&
        Date.parse(`${candidate.modified_gmt}Z`) >= since,
    ) ?? null
  );
}

async function createPost(
  connection: WordpressConnection,
  body: { title: string },
): Promise<unknown> {
  const since = Date.now() - RECOVERY_WINDOW_MS;
  // An earlier attempt that was reported as failed may have been saved after
  // all; update that post instead of adding a second one.
  const earlier = await findRecentPost(connection, body.title, since).catch(
    () => null,
  );
  if (earlier)
    return request(connection, `/wp/v2/posts/${earlier.id}`, {
      method: "POST",
      body,
    });
  try {
    return await request(connection, "/wp/v2/posts", {
      method: "POST",
      body,
      timeoutMs: CREATE_TIMEOUT_MS,
    });
  } catch (error) {
    if (!(error instanceof AppError && error.code === "UPSTREAM_UNAVAILABLE"))
      throw error;
    const saved = await findRecentPost(connection, body.title, since).catch(
      () => null,
    );
    if (saved) return saved;
    throw error;
  }
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
    /** The header picture's media id; null leaves the post's own as is. */
    featuredMedia: number | null;
    status: "draft" | "publish";
  },
): Promise<WordpressPost> {
  const body = {
    title: post.title,
    content: post.html,
    status: post.status,
    ...(post.excerpt ? { excerpt: post.excerpt } : {}),
    ...(post.featuredMedia ? { featured_media: post.featuredMedia } : {}),
  };
  let result: unknown;
  if (!post.postId) result = await createPost(connection, body);
  else
    try {
      result = await request(connection, `/wp/v2/posts/${post.postId}`, {
        method: "POST",
        body,
      });
    } catch (error) {
      // Someone deleted the post in WordPress: send it again as a new one.
      if (!(error instanceof AppError && error.code === "NOT_FOUND"))
        throw error;
      result = await createPost(connection, body);
    }
  const parsed = wpPostSchema.safeParse(result);
  if (!parsed.success)
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "WordPress accepted the post but sent back an unexpected answer.",
    );
  return parsed.data;
}
