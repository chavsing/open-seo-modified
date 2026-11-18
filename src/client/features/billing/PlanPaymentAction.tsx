import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import type { PlanOffer } from "@/client/features/billing/plan-offers";
import { organizationContextQueryOptions } from "@/client/features/team/organizationQueries";
import { captureClientEvent } from "@/client/lib/posthog";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { queryClient } from "@/client/tanstack-db";
import { reportPaypalSubscriptionApproved } from "@/serverFunctions/billing";
import { PaypalCheckoutButton } from "@/client/features/billing/PaypalCheckoutButton";
import {
  isClosedWindowError,
  loadPaypalSdk,
} from "@/client/features/billing/paypalSdk";
import { PAYPAL_PRO_PLAN_ID } from "@/shared/billing";

/**
 * How a plan is paid for: Pro yearly and Lifetime use the app's PayPal
 * checkout and turn on as soon as the payment is captured. Pro renders
 * PayPal's subscription button, tagged with this organization so PayPal's
 * webhook can turn the plan on when each month is paid. A reported
 * subscription waiting for its first payment replaces the button so nobody
 * subscribes twice.
 */
export function PlanPaymentAction({ offer }: { offer: PlanOffer }) {
  const { data: account } = useQuery({
    ...billingAccountQueryOptions(),
    // PayPal's webhook turns the plan on within a minute or so of the
    // first payment; check until it has.
    refetchInterval: (query) =>
      query.state.data?.pendingPaypalSubscriptionId ? 15_000 : false,
  });

  if (offer.billing !== "monthly") {
    return (
      <PaypalCheckoutButton
        product={offer.billing === "yearly" ? "pro_year" : "lifetime"}
        fallbackUrl={offer.paymentUrl}
        fallbackLabel={
          offer.billing === "yearly" ? "Pay for a year here" : "Pay once here"
        }
      />
    );
  }

  if (account?.pendingPaypalSubscriptionId) {
    return (
      <PendingSubscription
        subscriptionId={account.pendingPaypalSubscriptionId}
      />
    );
  }
  return <PaypalSubscribeButton fallbackUrl={offer.paymentUrl} />;
}

function PendingSubscription({ subscriptionId }: { subscriptionId: string }) {
  return (
    <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
      PayPal subscription{" "}
      <span className="font-medium text-foreground">{subscriptionId}</span>{" "}
      received. Your plan turns on as soon as PayPal confirms the first payment,
      usually within a few minutes. Questions? Email {SUPPORT_EMAIL}.
    </p>
  );
}

function PaypalSubscribeButton({ fallbackUrl }: { fallbackUrl: string }) {
  const { data: organization } = useQuery(organizationContextQueryOptions());
  const organizationId = organization?.organizationId;
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [approvedId, setApprovedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let buttons: { close: () => Promise<void> } | null = null;
    let cancelled = false;
    // Once PayPal's buttons are on the page they stay: an error after that
    // is one payment attempt failing, not PayPal being unavailable.
    let rendered = false;

    loadPaypalSdk("subscription")
      .then(async (paypal) => {
        if (cancelled || !containerRef.current) return;
        const instance = paypal.Buttons({
          style: {
            shape: "rect",
            color: "gold",
            layout: "vertical",
            label: "subscribe",
          },
          createSubscription: (_data, actions) => {
            setNotice(null);
            captureClientEvent("billing:paypal_click", { planId: "pro-plan" });
            // custom_id ties the subscription to this organization in PayPal.
            return actions.subscription.create({
              plan_id: PAYPAL_PRO_PLAN_ID,
              custom_id: organizationId,
            });
          },
          onApprove: async (data) => {
            const subscriptionId = data.subscriptionID ?? null;
            setApprovedId(subscriptionId ?? "");
            if (!subscriptionId) return;
            try {
              await reportPaypalSubscriptionApproved({
                data: { subscriptionId },
              });
              await queryClient.invalidateQueries({
                queryKey: billingAccountQueryOptions().queryKey,
              });
            } catch (error) {
              // The approval stands in PayPal; the message below still gives
              // the customer the ID to send us.
              console.error("Reporting the PayPal subscription failed", error);
            }
          },
          // Closing PayPal's window is the customer changing their mind.
          onCancel: () => setNotice(null),
          onError: (error) => {
            console.error("PayPal subscription button failed", error);
            if (!rendered) {
              setStatus("failed");
              return;
            }
            if (isClosedWindowError(error)) return;
            setNotice("The payment didn't go through. Please try again.");
          },
        });
        buttons = instance;
        containerRef.current.replaceChildren();
        await instance.render(containerRef.current);
        rendered = true;
        if (!cancelled) setStatus("ready");
      })
      .catch((error: unknown) => {
        console.error("PayPal button unavailable", error);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      void buttons?.close().catch(() => undefined);
    };
  }, [organizationId]);

  if (approvedId !== null) {
    return approvedId ? (
      <PendingSubscription subscriptionId={approvedId} />
    ) : (
      <p className="text-sm text-muted-foreground">
        Subscription approved. Your plan turns on as soon as PayPal confirms the
        first payment.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {status === "loading" ? <Skeleton className="h-11 w-full" /> : null}
      {status === "failed" ? (
        // PayPal's script didn't load (or the button failed): the plan's
        // share link still sells the same subscription.
        <Button
          variant="secondary"
          className="w-full"
          nativeButton={false}
          render={
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" />
          }
        >
          Subscribe with PayPal
        </Button>
      ) : null}
      {/* Stays visible while loading: PayPal sizes its button from it. */}
      {/* Its own stacking layer: PayPal gives its frames a high z-index,
          which would otherwise float over the mobile sidebar. */}
      {status === "failed" ? null : (
        <div ref={containerRef} className="relative isolate z-0" />
      )}
      {notice ? (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
