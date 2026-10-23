import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Skeleton } from "@/client/components/ui/skeleton";
import {
  AdminAccountCard,
  type AdminAccount,
} from "@/client/features/admin/AdminAccountCard";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  applyAdminBillingChange,
  getAdminStatus,
  listRenewalsDueAdminAccounts,
  listWaitingAdminAccounts,
  searchAdminAccounts,
} from "@/serverFunctions/admin";
import {
  LIFETIME_CREDITS,
  PRO_MONTHLY_CREDITS,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";

export const Route = createFileRoute("/_app/admin")({
  ssr: false,
  beforeLoad: () => {
    if (!isHostedClientAuthMode()) throw notFound();
  },
  component: AdminPage,
});

type Account = AdminAccount;
type Change =
  | { action: "pro_month" }
  | { action: "lifetime" }
  | { action: "add_credits"; amountUsd: number }
  | { action: "downgrade" };
type Pending = {
  account: Account;
  kind: Change["action"];
  // One id per confirm dialog: a repeated submit is refused, not doubled.
  requestId: string;
};

const usd = (credits: number) => `$${autumnSeoDataCreditsToUsd(credits)}`;
function AdminPage() {
  const statusQuery = useQuery({
    queryKey: ["admin", "status"],
    queryFn: () => getAdminStatus(),
  });

  if (statusQuery.isPending) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-6">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }
  if (!statusQuery.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 md:px-6">
        <PageHeader title="Admin" />
        <p className="text-sm text-muted-foreground">
          This page is only for admins.
        </p>
      </div>
    );
  }
  return <AdminBilling />;
}

function AdminBilling() {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [amountUsd, setAmountUsd] = useState("50");

  // An empty search shows the newest signups.
  const searchQuery = useQuery({
    queryKey: ["admin", "accounts", query],
    queryFn: () => searchAdminAccounts({ data: { query: query || null } }),
  });
  // Customers whose PayPal subscription is reported but not yet handled.
  const waitingQuery = useQuery({
    queryKey: ["admin", "waiting"],
    queryFn: () => listWaitingAdminAccounts(),
  });
  // Pro customers whose paid month ends soon or ended lately.
  const renewalsQuery = useQuery({
    queryKey: ["admin", "renewals"],
    queryFn: () => listRenewalsDueAdminAccounts(),
  });

  const mutation = useMutation({
    mutationFn: (args: Pending & { change: Change }) =>
      applyAdminBillingChange({
        data: {
          requestId: args.requestId,
          organizationId: args.account.organizationId,
          change: args.change,
        },
      }),
    onSuccess: (result) => {
      toast.success(result.applied ? "Saved" : "Already saved earlier");
      setPending(null);
      void searchQuery.refetch();
      void waitingQuery.refetch();
      void renewalsQuery.refetch();
    },
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const parsedAmount = Number(amountUsd);
  const amountValid =
    Number.isInteger(parsedAmount) &&
    parsedAmount >= 1 &&
    parsedAmount <= 10_000;

  function open(account: Account, kind: Change["action"]) {
    setAmountUsd("50");
    setPending({ account, kind, requestId: crypto.randomUUID() });
  }

  function confirm() {
    if (!pending) return;
    const change: Change =
      pending.kind === "add_credits"
        ? { action: "add_credits", amountUsd: parsedAmount }
        : { action: pending.kind };
    mutation.mutate({ ...pending, change });
  }

  return (
    <div className="mx-auto box-content max-w-4xl space-y-5 px-4 py-4 pb-24 md:px-6 md:py-6">
      <PageHeader title="Admin" />
      <p className="text-sm text-muted-foreground">
        After a PayPal payment, find the customer by the email they signed up
        with and record it here. Each Pro payment adds one month.
      </p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft.trim());
        }}
      >
        <Input
          type="search"
          placeholder="Customer email (at least 3 letters)"
          aria-label="Customer email"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" disabled={draft.trim().length < 3}>
          Search
        </Button>
      </form>

      {waitingQuery.data && waitingQuery.data.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-medium">Waiting for confirmation</h2>
          <p className="text-sm text-muted-foreground">
            These customers subscribed with the PayPal button. Find the
            subscription ID in your PayPal activity and check the payment went
            through. The PayPal button also sends the account ID as the
            subscription&rsquo;s custom ID; if PayPal shows it, it should match.
            Then click Start Pro.
          </p>
          {waitingQuery.data.map((account) => (
            <AdminAccountCard
              key={`waiting:${account.organizationId}:${account.email}`}
              account={account}
              onAction={(kind) => open(account, kind)}
            />
          ))}
        </section>
      ) : null}

      {renewalsQuery.data && renewalsQuery.data.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-medium">Due for renewal</h2>
          <p className="text-sm text-muted-foreground">
            PayPal charges these Pro customers every month. When you see this
            month&rsquo;s payment in PayPal, click Add a Pro month. Access ends
            3 days after the paid month unless it is renewed.
          </p>
          {renewalsQuery.data.map((account) => (
            <AdminAccountCard
              key={`renewal:${account.organizationId}:${account.email}`}
              account={account}
              onAction={(kind) => open(account, kind)}
            />
          ))}
        </section>
      ) : null}

      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-medium">
          {query ? <>Results for &ldquo;{query}&rdquo;</> : "Recent signups"}
        </h2>
        {query ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft("");
              setQuery("");
            }}
          >
            Show recent signups
          </Button>
        ) : null}
      </div>

      {searchQuery.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : searchQuery.isError ? (
        <QueryError
          cause={searchQuery.error}
          fallback="Search failed. Please try again."
          onRetry={() => void searchQuery.refetch()}
          isRetrying={searchQuery.isFetching}
        />
      ) : searchQuery.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query ? (
            <>No account matches &ldquo;{query}&rdquo;.</>
          ) : (
            "No signups yet."
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {searchQuery.data.map((account) => (
            <AdminAccountCard
              key={`${account.organizationId}:${account.email}`}
              account={account}
              onAction={(kind) => open(account, kind)}
            />
          ))}
        </div>
      )}

      {pending ? (
        <ConfirmDialog
          title={dialogTitle(pending.kind)}
          confirmLabel={pending.kind === "downgrade" ? "Downgrade" : "Confirm"}
          destructive={pending.kind === "downgrade"}
          pending={mutation.isPending}
          onClose={() => setPending(null)}
          onConfirm={() => {
            if (pending.kind === "add_credits" && !amountValid) return;
            confirm();
          }}
        >
          <span className="block">
            {pending.account.email} &middot; {pending.account.organizationName}
          </span>
          <span className="mt-2 block">{dialogBody(pending)}</span>
          {pending.kind === "add_credits" ? (
            <span className="mt-3 flex items-center gap-2">
              <span>$</span>
              <Input
                type="number"
                min={1}
                max={10_000}
                step={1}
                inputMode="numeric"
                aria-label="Credits to add, in USD"
                aria-invalid={!amountValid}
                value={amountUsd}
                onChange={(event) => setAmountUsd(event.target.value)}
              />
            </span>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

function dialogTitle(kind: Change["action"]) {
  switch (kind) {
    case "pro_month":
      return "Record a Pro payment?";
    case "lifetime":
      return "Activate Lifetime?";
    case "add_credits":
      return "Add credits?";
    case "downgrade":
      return "Downgrade to free?";
  }
}

function dialogBody({ account, kind }: Pending) {
  switch (kind) {
    case "pro_month":
      return account.planId === "pro-plan" && account.paidUntil
        ? `Adds one month to the paid period and refills the monthly credits to ${usd(PRO_MONTHLY_CREDITS)}.`
        : `Starts Pro for one month from today with ${usd(PRO_MONTHLY_CREDITS)} of credits.`;
    case "lifetime":
      return `Gives lifetime access and adds ${usd(LIFETIME_CREDITS)} of credits. If they pay for Pro in PayPal, cancel that subscription there so they are not charged again.`;
    case "add_credits":
      return "Adds extra credits that never expire. Use it after a customer pays for more credits.";
    case "downgrade":
      return "Removes paid access and all remaining credits now. Use it for refunds. A canceled Pro plan ends on its own when the paid month runs out.";
  }
}
