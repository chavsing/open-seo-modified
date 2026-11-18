import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers";
import {
  runAutomaticSetup,
  type SiteSetupPayload,
} from "@/server/features/project-context/services/automaticSetup";
import { pgStep } from "@/server/workflows/pgStep";

/**
 * Sets up a newly added site in the background. A single step with no
 * retries: it makes paid AI and search calls, and records how it ended for
 * the dashboard.
 */
export class SiteSetupWorkflow extends WorkflowEntrypoint<
  Env,
  SiteSetupPayload
> {
  async run(event: WorkflowEvent<SiteSetupPayload>, step: WorkflowStep) {
    await pgStep(
      step,
      "set-up-site",
      { retries: { limit: 0, delay: "1 second" }, timeout: "15 minutes" },
      () => runAutomaticSetup(event.payload),
    );
  }
}
