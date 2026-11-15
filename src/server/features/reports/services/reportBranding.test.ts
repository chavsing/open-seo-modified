import { describe, expect, it, vi } from "vitest";
import { reportDocumentResponse } from "@/shared/report-sandbox";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn(),
}));

import { brandingPrintHeader } from "./reportBranding";

const printed = (html: string, companyName: string) =>
  reportDocumentResponse(html, {
    print: true,
    cacheControl: "private, no-store",
    printHeader: brandingPrintHeader({
      companyName,
      websiteUrl: null,
      logoDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    }),
  }).text();

describe("printed report branding", () => {
  it("heads the document body with the logo and name", async () => {
    const html = await printed(
      '<html><body class="report"><h1>Audit</h1></body></html>',
      "Acme SEO",
    );

    expect(html).toMatch(
      /^<html><body class="report"><div [^>]*><img src="data:image\/png;base64,iVBORw0KGgo="[^>]*><span>Acme SEO<\/span><\/div><h1>Audit/,
    );
  });

  it("keeps a company name from adding markup", async () => {
    const html = await printed("<body></body>", '<script>x()</script> & "Co"');

    expect(html).toContain(
      "<span>&lt;script&gt;x()&lt;/script&gt; &amp; &quot;Co&quot;</span>",
    );
  });

  it("leaves the on-screen document untouched", async () => {
    const document = "<html><body><h1>Audit</h1></body></html>";
    const response = reportDocumentResponse(document, {
      cacheControl: "private, no-store",
      printHeader: "<div>Acme</div>",
    });

    expect(await response.text()).toBe(document);
  });
});
