import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import { loadPaddle, onPaddleEvent } from "@/client/features/billing/paddleSdk";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { captureClientEvent } from "@/client/lib/posthog";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { useSession } from "@/lib/auth-client";
import type { PaddleProduct } from "@/shared/billing";

const PAID_MESSAGES: Record<PaddleProduct, string> = {
  pro_month:
    "Payment received. Your Pro plan turns on as soon as Paddle confirms it, usually within a minute.",
  pro_year:
    "Payment received. Your Pro Yearly plan turns on as soon as Paddle confirms it, usually within a minute.",
  lifetime:
    "Payment received. Lifetime access turns on as soon as Paddle confirms it, usually within a minute.",
  credit_pack:
    "Payment received. Your extra credits are added as soon as Paddle confirms it, usually within a minute.",
};

/**
 * Opens Paddle's checkout for one product, tagged with this organization so
 * Paddle's webhook can apply the payment. The plan or credits arrive with
 * the webhook, so after paying the billing account is checked until they
 * do.
 */
export function PaddleCheckoutButton({
  product,
  label,
}: {
  product: PaddleProduct;
  label: string;
}) {
  const { data: account } = useQuery(billingAccountQueryOptions());
  const { data: organization } = useQuery(organizationContextQueryOptions());
  const { data: session } = useSession();
  const [opening, setOpening] = useState(false);
  const [paid, setPaid] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // What the account showed when the payment went through, to tell when
  // the webhook has applied it.
  const [before, setBefore] = useState<string | null>(null);
  const snapshot = account
    ? `${account.paidPlanId}:${account.paidUntil}:${account.topUpRemainingUsd}:${account.monthlyCreditsUsd}`
    : null;
  useQuery({
    ...billingAccountQueryOptions(),
    refetchInterval: paid && snapshot === before ? 5_000 : false,
  });
  useEffect(() => {
    if (!paid || before === null || snapshot === before) return;
    setPaid(false);
    toast.success(
      product === "credit_pack"
        ? "Your extra credits were added."
        : "Your plan is active.",
    );
  }, [paid, before, snapshot, product]);

  const config = account?.paddle;
  const organizationId = organization?.organizationId;
  if (!config) return null;

  const open = async () => {
    if (!organizationId) return;
    setNotice(null);
    setOpening(true);
    captureClientEvent("billing:paddle_click", { product });
    try {
      const paddle = await loadPaddle(config);
      // Captures this render's snapshot on purpose: it is the account as it
      // was before paying.
      onPaddleEvent((event) => {
        if (event.name === "checkout.completed") {
          setBefore(snapshot);
          setPaid(true);
        }
      });
      const email = session?.user?.email;
      paddle.Checkout.open({
        items: [{ priceId: config.priceIds[product], quantity: 1 }],
        customer: email ? { email } : undefined,
        customData: { organizationId, product },
        settings: {
          displayMode: "overlay",
          theme: document.documentElement
            .getAttribute("data-theme")
            ?.endsWith("-dark")
            ? "dark"
            : "light",
        },
      });
    } catch (error) {
      console.error("Paddle checkout unavailable", error);
      setNotice(
        `Checkout couldn't load. Turn off any ad blocker and try again, or email ${SUPPORT_EMAIL}.`,
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="space-y-2">
      {paid ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground"
        >
          {PAID_MESSAGES[product]} Questions? Email {SUPPORT_EMAIL}.
        </p>
      ) : (
        <Button
          className="w-full"
          disabled={opening || !organizationId}
          onClick={() => void open()}
        >
          {opening ? "Opening checkout..." : label}
        </Button>
      )}
      {notice ? (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
