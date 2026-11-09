import { toast } from "sonner";
import {
  getErrorCode,
  getStandardErrorMessage,
} from "@/client/lib/error-messages";
import type { ErrorCode } from "@/shared/error-codes";

export const blogKeys = {
  settings: (projectId: string) => ["blog", projectId, "settings"] as const,
  topics: (projectId: string) => ["blog", projectId, "topics"] as const,
  articles: (projectId: string) => ["blog", projectId, "articles"] as const,
  article: (projectId: string, articleId: string) =>
    ["blog", projectId, "article", articleId] as const,
};

/**
 * The client receives only an error code, never the server's message, so each
 * action words its own expected failures and falls back to the standard copy.
 */
export function toastBlogError(
  error: unknown,
  messages: Partial<Record<ErrorCode, string>> = {},
) {
  const code = getErrorCode(error);
  toast.error((code && messages[code]) || getStandardErrorMessage(error));
}
