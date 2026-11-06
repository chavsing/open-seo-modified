import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Switch } from "@/client/components/ui/switch";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  addSignupAllowedEmail,
  getSignupAccess,
  removeSignupAllowedEmail,
  setSignupInviteOnly,
} from "@/serverFunctions/admin";

const queryKey = ["admin", "signup-access"];

/** The admin's invite-only switch and the emails allowed to sign up. */
export function SignupAccessSection() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const accessQuery = useQuery({ queryKey, queryFn: () => getSignupAccess() });

  const onError = (error: unknown) =>
    toast.error(getStandardErrorMessage(error));
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const toggle = useMutation({
    mutationFn: (inviteOnly: boolean) =>
      setSignupInviteOnly({ data: { inviteOnly } }),
    onSuccess: refresh,
    onError,
  });
  const add = useMutation({
    mutationFn: (value: string) =>
      addSignupAllowedEmail({ data: { email: value } }),
    onSuccess: () => {
      setEmail("");
      void refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (value: string) =>
      removeSignupAllowedEmail({ data: { email: value } }),
    onSuccess: refresh,
    onError,
  });

  const draft = email.trim();
  const draftValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft);

  return (
    <section className="space-y-3">
      <h2 className="font-medium">Who can sign up</h2>
      {accessQuery.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : accessQuery.isError ? (
        <QueryError
          cause={accessQuery.error}
          fallback="Couldn't load the sign-up settings. Please try again."
          onRetry={() => void accessQuery.refetch()}
          isRetrying={accessQuery.isFetching}
        />
      ) : (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <label htmlFor="signup-invite-only" className="space-y-1">
                <span className="block text-sm font-medium">Invite-only</span>
                <span className="block text-sm text-muted-foreground">
                  {accessQuery.data.inviteOnly
                    ? "Only the emails below, admins and people with a team invitation can create an account."
                    : "Anyone can create an account. The list below is kept for when you switch invite-only back on."}{" "}
                  Existing accounts always keep signing in.
                </span>
              </label>
              <Switch
                id="signup-invite-only"
                checked={accessQuery.data.inviteOnly}
                disabled={toggle.isPending}
                onCheckedChange={(checked) => toggle.mutate(checked)}
              />
            </div>

            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (draftValid) add.mutate(draft);
              }}
            >
              <Input
                type="email"
                placeholder="customer@example.com"
                aria-label="Email to allow"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" disabled={!draftValid || add.isPending}>
                Allow
              </Button>
            </form>

            {accessQuery.data.emails.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No emails allowed yet. Add a customer&rsquo;s email before they
                sign up. They must sign up with exactly that email.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-md border border-border">
                {accessQuery.data.emails.map((row) => (
                  <li
                    key={row.email}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="truncate" data-ph-mask>
                      {row.email}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(row.email)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
