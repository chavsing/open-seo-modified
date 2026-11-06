import { useState } from "react";
import { captureClientEvent } from "@/client/lib/posthog";
import { authClient } from "@/lib/auth-client";
import { toAuthCallbackURL } from "@/lib/auth-redirect";

type SocialProvider = "google" | "microsoft";

const PROVIDER_LABELS: Record<SocialProvider, string> = {
  google: "Google",
  microsoft: "Microsoft",
};

// Microsoft sign-in is optional; its button shows only when the build has the
// public client ID (the server needs the matching secret too).
export const isMicrosoftSignInEnabled = Boolean(
  import.meta.env.MICROSOFT_CLIENT_ID?.trim(),
);

export function useSocialAuth({
  provider,
  redirectTo,
  postSignupRedirect,
}: {
  provider: SocialProvider;
  redirectTo: string;
  postSignupRedirect?: string;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSignUp = postSignupRedirect !== undefined;
  const label = PROVIDER_LABELS[provider];

  async function start() {
    setError(null);
    setIsStarting(true);
    try {
      captureClientEvent(
        isSignUp
          ? `auth:sign_up_${provider}_start`
          : `auth:sign_in_${provider}_start`,
        { redirect_to: redirectTo },
      );
      const result = await authClient.signIn.social({
        provider,
        callbackURL: toAuthCallbackURL(redirectTo),
        ...(isSignUp
          ? {
              newUserCallbackURL: toAuthCallbackURL(postSignupRedirect),
              requestSignUp: true,
            }
          : {}),
      });
      if (!result.error) return;
      setError(result.error.message || fallbackMessage);
    } catch {
      setError(fallbackMessage);
    }
    setIsStarting(false);
  }

  const fallbackMessage = isSignUp
    ? `${label} sign up is not available right now.`
    : `${label} sign in is not available right now.`;

  return { isStarting, error, start, clearError: () => setError(null) };
}
