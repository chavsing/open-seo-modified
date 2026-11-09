import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { BRAND_NAME } from "@/shared/brand";

const OPENROUTER_KEY_MISSING_MESSAGE = `OPENROUTER_API_KEY is not set for this deployment yet. Add it to your environment, restart ${BRAND_NAME}, then confirm here.`;

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

type SamAccessStatus = {
  enabled: boolean;
  hosted: boolean;
  errorMessage: string | null;
};

// Gates the in-app AI agent (SAM) on an OpenRouter key being configured, the
// same way backlinks/AI-search gate on their DataForSEO subscriptions. Hosted
// deployments are checked too: without the key every chat turn would fail, so
// customers see a "being set up" notice instead of a broken chat.
export const getSamAccessSetupStatus = createServerFn({ method: "GET" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async (): Promise<SamAccessStatus> => {
    const hosted = await isHostedServerAuthMode();
    const enabled = Boolean(await getOptionalEnvValue("OPENROUTER_API_KEY"));
    return {
      enabled,
      hosted,
      // Hosted customers can't set the key, so they get no setup steps.
      errorMessage: enabled || hosted ? null : OPENROUTER_KEY_MISSING_MESSAGE,
    };
  });
