// The refusal for a sign-up blocked by invite-only mode. The email form shows
// the message; Google sign-up redirects to /auth-error with it as the error
// code (spaces become underscores), so both screens match on it.
export const INVITE_ONLY_SIGNUP_MESSAGE = "Sign-up is invite-only";
export const INVITE_ONLY_SIGNUP_ERROR_CODE =
  INVITE_ONLY_SIGNUP_MESSAGE.split(" ").join("_");

// The refusal for a Microsoft sign-up whose email Microsoft hasn't confirmed
// (a work tenant can set any address). Reaches /auth-error the same way.
export const UNVERIFIED_PROVIDER_EMAIL_MESSAGE = "Email not confirmed";
export const UNVERIFIED_PROVIDER_EMAIL_ERROR_CODE =
  UNVERIFIED_PROVIDER_EMAIL_MESSAGE.split(" ").join("_");
