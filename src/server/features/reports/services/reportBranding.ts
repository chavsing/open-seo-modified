import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reportBranding } from "@/db/schema";
import { customerHasPaidPlan } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import type { z } from "zod";
import type { saveReportBrandingSchema } from "@/types/schemas/report-branding";

// An account's own name and logo on its reports, in place of the app's (white
// label). A paid plan feature on the hosted app: a lapsed plan keeps the saved
// branding but stops showing it.

type ReportBranding = {
  companyName: string;
  websiteUrl: string | null;
  logoDataUrl: string | null;
};

async function readBranding(
  organizationId: string,
): Promise<ReportBranding | null> {
  const [row] = await db
    .select({
      companyName: reportBranding.companyName,
      websiteUrl: reportBranding.websiteUrl,
      logoDataUrl: reportBranding.logoDataUrl,
    })
    .from(reportBranding)
    .where(eq(reportBranding.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

async function brandingAllowed(organizationId: string) {
  return (
    !(await isHostedServerAuthMode()) || customerHasPaidPlan(organizationId)
  );
}

/** The settings page's view: the saved branding and whether the plan shows it. */
export async function getReportBrandingSettings(organizationId: string) {
  return {
    branding: await readBranding(organizationId),
    allowed: await brandingAllowed(organizationId),
  };
}

/** The branding to show on a report, or null for the app's own. */
export async function activeReportBranding(organizationId: string) {
  const branding = await readBranding(organizationId);
  if (!branding) return null;
  return (await brandingAllowed(organizationId)) ? branding : null;
}

export async function saveReportBranding(
  organizationId: string,
  input: z.infer<typeof saveReportBrandingSchema>,
) {
  if (!(await brandingAllowed(organizationId)))
    throw new AppError(
      "VALIDATION_ERROR",
      "Your own branding on reports is part of the paid plans.",
    );
  const row = {
    companyName: input.companyName,
    websiteUrl: input.websiteUrl || null,
    logoDataUrl: input.logoDataUrl,
    updatedAt: new Date().toISOString(),
  };
  await db
    .insert(reportBranding)
    .values({ organizationId, ...row })
    .onConflictDoUpdate({ target: reportBranding.organizationId, set: row });
  return getReportBrandingSettings(organizationId);
}

export async function removeReportBranding(organizationId: string) {
  await db
    .delete(reportBranding)
    .where(eq(reportBranding.organizationId, organizationId));
  return getReportBrandingSettings(organizationId);
}

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ] ?? char,
  );

/**
 * The band at the top of a printed report. Inline styles and a data: logo are
 * all the report sandbox allows; the logo was checked to be a plain base64
 * image when it was saved.
 */
export function brandingPrintHeader(branding: ReportBranding) {
  const logo = branding.logoDataUrl
    ? `<img src="${branding.logoDataUrl}" alt="" style="height:40px;width:auto;max-width:200px;object-fit:contain">`
    : "";
  return `<div style="display:flex;align-items:center;gap:12px;margin:0 0 24px;padding:0 0 16px;border-bottom:1px solid #d4d4d4;font:600 18px/1.3 system-ui,sans-serif;color:#111">${logo}<span>${escapeHtml(branding.companyName)}</span></div>`;
}
