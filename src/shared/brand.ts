// The product's brand. Change these values to rebrand the app: the screens,
// emails, the in-app AI assistant, shared reports and the MCP server all read
// their name and links from here.
//
// Not covered here, update by hand when rebranding: the logo and icon images
// in src/public (transparent-logo.png, favicon*, android-chrome-*,
// apple-touch-icon.png) and the static landing page in landing/.

export const BRAND_NAME = "AGS MASTER";

// The brand as one word, for identifiers that cannot contain spaces.
export const BRAND_TOKEN = BRAND_NAME.replace(/\s+/g, "");

export const SUPPORT_EMAIL = "bryansumait.contact@gmail.com";

// The public marketing site (the landing page in landing/).
export const MARKETING_SITE_URL = "https://agsmaster.com";

// The legal pages and pricing, linked from the sign-in, sign-up and billing
// pages (the payment provider checks they are there). landing/ serves them.
export const TERMS_URL = `${MARKETING_SITE_URL}/terms`;
export const PRIVACY_URL = `${MARKETING_SITE_URL}/privacy`;
export const REFUNDS_URL = `${MARKETING_SITE_URL}/refunds`;
export const PRICING_URL = `${MARKETING_SITE_URL}/#pricing`;

// The app's own address, used only where the real one can't be read from the
// current request.
export const APP_URL_FALLBACK = "https://app.agsmaster.com";

// The crawler identity site audits send to the sites they crawl. Site owners
// allowlist it by this name, so it changes with the brand.
export const CRAWLER_NAME = `${BRAND_TOKEN}-Audit`;
export const CRAWLER_USER_AGENT = `${CRAWLER_NAME}/1.0`;
