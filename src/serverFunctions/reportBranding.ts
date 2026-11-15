import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireOrgPermission } from "@/server/auth/org-gate";
import {
  getReportBrandingSettings,
  removeReportBranding,
  saveReportBranding,
} from "@/server/features/reports/services/reportBranding";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { saveReportBrandingSchema } from "@/types/schemas/report-branding";

// The account's branding on reports. Reached from a project's Reports page, so
// the project middleware resolves the organization; the branding itself is
// organization-wide, so changing it takes the same right as connecting an
// integration.

const projectScopeSchema = z.object({ projectId: z.string().min(1) });

export const getReportBranding = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopeSchema)
  .handler(({ context }) => getReportBrandingSettings(context.organizationId));

export const updateReportBranding = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveReportBrandingSchema.extend(projectScopeSchema.shape))
  .handler(({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return saveReportBranding(context.organizationId, data);
  });

export const deleteReportBranding = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopeSchema)
  .handler(({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return removeReportBranding(context.organizationId);
  });
