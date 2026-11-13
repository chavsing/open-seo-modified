import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Skeleton } from "@/client/components/ui/skeleton";
import { getAdminAiBalance } from "@/serverFunctions/admin";

// Mirrors LOW_BALANCE_USD on the server, which emails the admins daily.
const LOW_BALANCE_USD = 10;

/** The OpenRouter balance every AI feature runs on. */
export function AiBalanceCard() {
  const balance = useQuery({
    queryKey: ["admin", "ai-balance"],
    queryFn: () => getAdminAiBalance(),
    staleTime: 60_000,
  });
  if (balance.isPending) return <Skeleton className="h-16" />;
  const data = balance.data;
  const low = data ? data.availableUsd < LOW_BALANCE_USD : false;
  return (
    <section className="rounded-lg border p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-medium">AI balance (OpenRouter)</h2>
        {data ? (
          <span
            className={
              low
                ? "flex items-center gap-1 text-lg font-semibold text-destructive tabular-nums"
                : "text-lg font-semibold tabular-nums"
            }
          >
            {low ? <CircleAlert className="size-4" /> : null}$
            {data.availableUsd.toFixed(2)} left
          </span>
        ) : null}
      </div>
      {data ? (
        <p className="mt-1 text-muted-foreground">
          {data.keyUsd !== null && data.keyUsd < data.accountUsd
            ? `The app's key is limited to $${data.keyUsd.toFixed(2)} more this month; the account holds $${data.accountUsd.toFixed(2)}.`
            : "Articles, reviews, pictures and the assistant all stop when this runs out."}{" "}
          Admins get an email each day it is under ${LOW_BALANCE_USD}.{" "}
          <a
            href="https://openrouter.ai/settings/credits"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Top up
          </a>
        </p>
      ) : (
        <p className="mt-1 text-muted-foreground">
          Couldn&apos;t read the balance from OpenRouter right now.
        </p>
      )}
    </section>
  );
}
