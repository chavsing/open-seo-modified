import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  PRICING_URL,
  PRIVACY_URL,
  REFUNDS_URL,
  TERMS_URL,
} from "@/shared/brand";

const LINKS = [
  { label: "Pricing", href: PRICING_URL },
  { label: "Terms", href: TERMS_URL },
  { label: "Privacy", href: PRIVACY_URL },
  { label: "Refund policy", href: REFUNDS_URL },
];

/** Pricing and the legal pages, under the sign-in and billing pages. The
 *  payment provider checks that the pages customers pay from link them.
 *  Hosted only: a self-hosted install has no such pages. */
export function LegalLinks({
  align = "center",
}: {
  align?: "center" | "start";
}) {
  if (!isHostedClientAuthMode()) return null;
  return (
    <nav
      aria-label="Legal"
      className={`flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground ${align === "center" ? "justify-center" : "justify-start"}`}
    >
      {LINKS.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline-offset-2 hover:text-foreground hover:underline"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
