import { createServerFn } from "@tanstack/react-start";
import { ProjectContextService } from "@/server/features/project-context/services/ProjectContextService";
import { setUpFromWebsite } from "@/server/features/project-context/services/websiteSetup";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  getProjectContextSchema,
  updateProjectContextSchema,
} from "@/types/schemas/projectContext";

export const getProjectContext = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getProjectContextSchema)
  .handler(async ({ context }) =>
    ProjectContextService.getProjectContext(context.projectId),
  );

export const updateProjectContext = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateProjectContextSchema)
  .handler(async ({ data, context }) =>
    // Everything reaching this entry point is a person editing their own
    // project's memory; SAM and MCP writes go through the same service with
    // their own author.
    ProjectContextService.applyContextUpdates(
      context.projectId,
      data.updates,
      "user",
    ),
  );

/** Drafts the Context page from the website and researches blog topics. */
export const setUpProjectFromWebsite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getProjectContextSchema)
  .handler(({ context }) => setUpFromWebsite(context.project, context));
