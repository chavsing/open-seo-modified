// The product's brand. Change these values to rebrand the app: the screens,
// emails, the in-app AI assistant, shared reports and the MCP server all read
// their name and links from here.
//
// Not covered here, update by hand when rebranding: the logo and icon images
// in src/public (transparent-logo.png, favicon*, android-chrome-*,
// apple-touch-icon.png) and the static landing page in landing/.

export const BRAND_NAME = "OpenSEO";

export const SUPPORT_EMAIL = "support@openseo.so";

// The public marketing site (the landing page in landing/).
export const MARKETING_SITE_URL = "https://openseo.so";

// The legal pages linked from sign-up. landing/ serves them at these paths.
export const TERMS_URL = `${MARKETING_SITE_URL}/terms`;
export const PRIVACY_URL = `${MARKETING_SITE_URL}/privacy`;

// The app's own address, used only where the real one can't be read from the
// current request.
export const APP_URL_FALLBACK = "https://app.openseo.so";

// The crawler identity site audits send to the sites they crawl. Site owners
// allowlist it by this name, so it changes with the brand.
export const CRAWLER_USER_AGENT = `${BRAND_NAME}-Audit/1.0`;
