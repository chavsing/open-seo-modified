import { startAutomaticSetup } from "@/server/features/project-context/services/automaticSetup";
import { DashboardFirstAuditService } from "@/server/features/dashboard/services/DashboardFirstAuditService";
import { waitUntil } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { ProjectService } from "@/server/features/projects/services/ProjectService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
  requireAuthenticatedReadContext,
} from "@/serverFunctions/middleware";
import {
  archiveProjectSchema,
  createProjectSchema,
  restoreProjectSchema,
  updateProjectSchema,
} from "@/types/schemas/projects";
import { z } from "zod";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });

/**
 * Starts a new site's first audit, then its automatic setup. Both are kept
 * alive with waitUntil: a customer who leaves the page before the reply would
 * otherwise cancel them, and nothing starts them again for that site. The
 * reply waits only for the audit, whose status the page shows.
 */
function startSiteWork(
  project: { id: string; domain: string | null },
  customer: BillingCustomerContext,
) {
  const audit = DashboardFirstAuditService.start(
    project.id,
    project.domain,
    customer,
  );
  waitUntil(
    audit.catch(() => null).then(() => startAutomaticSetup(project, customer)),
  );
  return audit;
}

export const getProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedReadContext)
  .handler(async ({ context }) =>
    ProjectService.listProjectsEnsuringOne(context.organizationId),
  );

export const createProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(createProjectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { project: ["create"] });
    const project = await ProjectService.createProject(
      context.organizationId,
      data,
    );
    const initialAudit = await startSiteWork(project, {
      ...context,
      projectId: project.id,
    });
    return { ...project, initialAudit };
  });

export const updateProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateProjectSchema)
  .handler(async ({ data, context }) => {
    const project = await ProjectService.updateProject(
      context.organizationId,
      data,
    );
    const initialAudit =
      project.domain !== context.project.domain
        ? await startSiteWork(project, context)
        : null;
    return { ...project, initialAudit };
  });

export const archiveProject = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(archiveProjectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { project: ["delete"] });
    return ProjectService.archiveProject(context.organizationId, data);
  });

export const getArchivedProjects = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedReadContext)
  .handler(async ({ context }) =>
    ProjectService.listArchivedProjects(context.organizationId),
  );

export const restoreProject = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(restoreProjectSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { project: ["delete"] });
    return ProjectService.restoreProject(context.organizationId, data);
  });

export const getProjectAccess = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedReadContext)
  .validator(projectScopedSchema)
  .handler(async ({ data, context }) => {
    return ProjectService.getProjectForOrganization(
      context.organizationId,
      data.projectId,
    );
  });
