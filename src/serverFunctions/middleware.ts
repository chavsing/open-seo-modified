import { createMiddleware } from "@tanstack/react-start";
import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { errorHandlingMiddleware } from "@/middleware/errorHandling";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { ensureUserMiddleware } from "@/middleware/ensureUser";
import { canEditWorkspace } from "@/lib/org-permissions";

const ensuredUserContextSchema: z.ZodType<EnsuredUserContext> = z.object({
  userId: z.string(),
  userEmail: z.string(),
  emailVerified: z.boolean(),
  organizationId: z.string(),
  role: z.string(),
  project: z.any().optional(),
});

function getAuthenticatedContext(context: unknown): EnsuredUserContext {
  const result = ensuredUserContextSchema.safeParse(context);
  if (!result.success) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Authenticated server function context missing",
    );
  }
  return result.data;
}

export const globalServerFunctionMiddleware = [
  errorHandlingMiddleware,
  ensureUserMiddleware,
] as const;

// A view-only member is refused everywhere by default, so a new server function
// can't let one change data or spend credits by accident. Functions that only
// read saved data, without billing, use the *ReadContext variants instead.
function authenticatedContext(context: unknown, allowViewer: boolean) {
  const ensured = getAuthenticatedContext(context);
  if (!allowViewer && !canEditWorkspace(ensured.role)) {
    throw new AppError("VIEW_ONLY");
  }
  return ensured;
}

function projectContext(context: unknown, allowViewer: boolean) {
  const ensured = authenticatedContext(context, allowViewer);
  if (!ensured.project) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Project context missing from authenticated server function",
    );
  }
  return {
    ...ensured,
    project: ensured.project,
    projectId: ensured.project.id,
  };
}

export const requireAuthenticatedContext = [
  createMiddleware({ type: "function" }).server(({ next, context }) =>
    next({ context: authenticatedContext(context, false) }),
  ),
] as const;

export const requireAuthenticatedReadContext = [
  createMiddleware({ type: "function" }).server(({ next, context }) =>
    next({ context: authenticatedContext(context, true) }),
  ),
] as const;

export const requireProjectContext = [
  createMiddleware({ type: "function" }).server(({ next, context }) =>
    next({ context: projectContext(context, false) }),
  ),
] as const;

export const requireProjectReadContext = [
  createMiddleware({ type: "function" }).server(({ next, context }) =>
    next({ context: projectContext(context, true) }),
  ),
] as const;
