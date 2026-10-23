// The product's brand. Change these values to rebrand the app: the screens,
// emails, the in-app AI assistant, shared reports and the MCP server all read
// their name and links from here.
//
// Not covered here, update by hand when rebranding: the logo and icon images
// in src/public (transparent-logo.png, favicon*, android-chrome-*,
// apple-touch-icon.png), src/public/site.webmanifest, and the static landing
// page in landing/.

export const BRAND_NAME = "OpenSEO";

export const SUPPORT_EMAIL = "support@openseo.so";

// The public marketing site. Links to its terms, privacy, docs and blog
// pages build on it, so those pages must exist there after a rebrand.
export const MARKETING_SITE_URL = "https://openseo.so";

// The app's own address, used only where the real one can't be read from the
// current request.
export const APP_URL_FALLBACK = "https://app.openseo.so";

// The crawler identity site audits send to the sites they crawl. Site owners
// allowlist it by this name, so it changes with the brand.
export const CRAWLER_USER_AGENT = `${BRAND_NAME}-Audit/1.0`;
