import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Skeleton } from "@/client/components/ui/skeleton";
import { getPlanName } from "@/client/features/billing/plan-offers";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  applyAdminBillingChange,
  getAdminStatus,
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

type Account = Awaited<ReturnType<typeof searchAdminAccounts>>[number];
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
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

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

  const searchQuery = useQuery({
    queryKey: ["admin", "accounts", query],
    queryFn: () => searchAdminAccounts({ data: { query } }),
    enabled: query.length >= 3,
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

      {query.length < 3 ? null : searchQuery.isPending ? (
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
          No account matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="space-y-3">
          {searchQuery.data.map((account) => (
            <AccountCard
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

function AccountCard({
  account,
  onAction,
}: {
  account: Account;
  onAction: (kind: Change["action"]) => void;
}) {
  const plan = account.planId === "free" ? "Free" : getPlanName(account.planId);
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium" data-ph-mask>
              {account.email}
            </p>
            <p className="text-xs text-muted-foreground">
              {account.organizationName} &middot; {account.role}
            </p>
          </div>
          <p className="text-sm">
            <span className="font-medium">{plan}</span>
            {account.paidUntil ? (
              <span className="text-muted-foreground">
                {" "}
                &middot; paid until {formatDate(account.paidUntil)}
              </span>
            ) : null}
            {account.planId !== "free" && !account.hasPaidAccess ? (
              <span className="text-destructive"> &middot; expired</span>
            ) : null}
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Credits: ${account.monthlyRemainingUsd.toFixed(2)} plan &middot; $
          {account.extraRemainingUsd.toFixed(2)} extra
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onAction("pro_month")}>
            {account.planId === "pro-plan" ? "Add a Pro month" : "Start Pro"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onAction("lifetime")}
            disabled={account.planId === "lifetime-plan"}
          >
            Activate Lifetime
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onAction("add_credits")}
          >
            Add credits
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onAction("downgrade")}
            disabled={account.planId === "free"}
          >
            Downgrade to free
          </Button>
        </div>
      </CardContent>
    </Card>
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
