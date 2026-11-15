import { z } from "zod";

// About 100 KB of image once decoded: enough for a sharp logo, small enough to
// embed in every printed report.
export const MAX_LOGO_DATA_URL_CHARS = 140_000;

export const saveReportBrandingSchema = z.object({
  companyName: z.string().trim().min(1, "Add your company name").max(80),
  websiteUrl: z
    .string()
    .trim()
    .max(300)
    .refine(
      (value) => value === "" || /^https?:\/\/[^\s"'<>]+$/i.test(value),
      "Enter a web address starting with https://",
    ),
  // PNG, JPEG or WebP only: an SVG can carry its own markup.
  logoDataUrl: z
    .string()
    .max(MAX_LOGO_DATA_URL_CHARS, "Use a logo under 100 KB")
    .regex(
      /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/,
      "Use a PNG, JPEG or WebP logo",
    )
    .nullable(),
});
