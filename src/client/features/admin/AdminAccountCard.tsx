import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { getPlanName } from "@/client/features/billing/plan-offers";
import type { searchAdminAccounts } from "@/serverFunctions/admin";

export type AdminAccount = Awaited<
  ReturnType<typeof searchAdminAccounts>
>[number];
type AdminAction =
  | "pro_month"
  | "lifetime"
  | "add_credits"
  | "downgrade";

const DAY_MS = 24 * 60 * 60_000;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/** Where a paid account stands: renewing soon, in its grace days, expired. */
function RenewalStatus({ account }: { account: AdminAccount }) {
  if (account.planId === "free") return null;
  if (!account.hasPaidAccess) {
    return <span className="text-destructive"> &middot; expired</span>;
  }
  if (!account.paidUntil || !account.accessEndsAt) return null;
  const now = Date.now();
  const paidUntil = Date.parse(account.paidUntil);
  if (paidUntil <= now) {
    return (
      <span className="text-amber-600">
        {" "}
        &middot; grace period, access ends {formatDate(account.accessEndsAt)}
      </span>
    );
  }
  const days = Math.ceil((paidUntil - now) / DAY_MS);
  return days <= 3 ? (
    <span className="text-amber-600">
      {" "}
      &middot; renews in {days} {days === 1 ? "day" : "days"}
    </span>
  ) : null;
}

/** One customer on the admin page, with the plan and credit actions. */
export function AdminAccountCard({
  account,
  onAction,
}: {
  account: AdminAccount;
  onAction: (kind: AdminAction) => void;
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
            <p className="text-xs text-muted-foreground tabular-nums">
              Account ID: {account.organizationId}
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
            <RenewalStatus account={account} />
          </p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          Credits: ${account.monthlyRemainingUsd.toFixed(2)} plan &middot; $
          {account.extraRemainingUsd.toFixed(2)} extra
        </p>
        {account.paypalSubscriptionId ? (
          <p className="text-xs">
            PayPal subscription{" "}
            <span className="font-medium tabular-nums">
              {account.paypalSubscriptionId}
            </span>
            {account.paypalSubscriptionShared ? (
              <span className="font-medium text-destructive">
                {" "}
                &middot; another account reported this same ID: check in PayPal
                which account it belongs to before activating
              </span>
            ) : null}
            {account.paypalReportedAt ? (
              <span className="text-amber-600">
                {" "}
                &middot; waiting for confirmation since{" "}
                {formatDate(account.paypalReportedAt)}
              </span>
            ) : null}
          </p>
        ) : null}
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
