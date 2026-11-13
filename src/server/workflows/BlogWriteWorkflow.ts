import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import {
  runArticleWriting,
  type BlogWritePayload,
} from "@/server/features/blog/services/blogWriting";
import { pgStep } from "@/server/workflows/pgStep";

/**
 * Writes one blog article in the background. A single step with no retries:
 * each attempt is several paid model calls, and the step records its own
 * failure on the article for the person to retry.
 */
export class BlogWriteWorkflow extends WorkflowEntrypoint<
  Env,
  BlogWritePayload
> {
  async run(event: WorkflowEvent<BlogWritePayload>, step: WorkflowStep) {
    await pgStep(
      step,
      "write-article",
      { retries: { limit: 0, delay: "1 second" }, timeout: "15 minutes" },
      () => runArticleWriting(event.payload),
    );
  }
}
