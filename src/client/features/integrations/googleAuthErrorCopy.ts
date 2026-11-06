import { BRAND_NAME, SUPPORT_EMAIL } from "@/shared/brand";
import {
  INVITE_ONLY_SIGNUP_ERROR_CODE,
  UNVERIFIED_PROVIDER_EMAIL_ERROR_CODE,
} from "@/shared/signup-access";

/**
 * Plain-language copy for Google OAuth failures, shared by the connect-surface
 * inline alert (GoogleLinkErrorAlert) and the /auth-error fallback page.
 * `code` is the `error` query param on the redirect: Google's own error code
 * (access_denied), or one set by googleOAuth.ts / Better Auth.
 *
 * `providerLabel` ("Search Console" / "Google Analytics") is set when the
 * failure came from a connect flow; without it the copy reads as a sign-in
 * failure, worded so it fits Google and Microsoft sign-in alike.
 */
export function googleAuthErrorCopy(
  code: string,
  providerLabel?: string,
): { title: string; description: string } {
  const what = providerLabel ? `${providerLabel} connection` : "Sign-in";
  const service = providerLabel ? "Google" : "the sign-in provider";

  switch (code) {
    case "state_mismatch":
      return {
        title: `${what} didn't finish`,
        description: `The attempt expired or was interrupted. Try again in a single browser tab and finish the ${providerLabel ? "Google" : "sign-in"} steps within 10 minutes. If it keeps happening, make sure your browser allows cookies for this site.`,
      };
    case "access_denied":
      return {
        title: `${what} was canceled`,
        description: `${providerLabel ? "Google's" : "The"} permission screen was closed or declined. Try again whenever you're ready.`,
      };
    case "scope_not_granted":
      return {
        title: `${what} is missing a permission`,
        description: `${BRAND_NAME} didn't get access to your ${providerLabel ?? "Google"} data because a box on Google's permission screen wasn't checked. Try again and check every box before you continue.`,
      };
    case INVITE_ONLY_SIGNUP_ERROR_CODE:
      return {
        title: `${BRAND_NAME} is invite-only`,
        description: `This account's email isn't on the list of people who can sign up. Email ${SUPPORT_EMAIL} to get access, then sign up with that same email.`,
      };
    case UNVERIFIED_PROVIDER_EMAIL_ERROR_CODE:
      return {
        title: "This email isn't confirmed",
        description:
          "Microsoft didn't confirm that this account owns its email address, which happens with some work accounts. Sign up with email instead, using the same address, and confirm it from your inbox.",
      };
    case "connection_save_failed":
      return {
        title: `${what} didn't finish`,
        description:
          "We couldn't save the connection. Please try again — if it keeps failing, contact support.",
      };
    default:
      return {
        title: `${what} didn't finish`,
        description: `Something went wrong while talking to ${service}. Please try again — if it keeps failing, contact support.`,
      };
  }
}
