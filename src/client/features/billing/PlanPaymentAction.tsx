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
import { PAYPAL_CLIENT_ID, PAYPAL_PRO_PLAN_ID } from "@/shared/billing";

// The slice of PayPal's JS SDK the Pro button uses.
type PaypalButtons = {
  render: (container: HTMLElement) => Promise<void>;
  close: () => Promise<void>;
};
type PaypalSdk = {
  Buttons: (options: {
    style: Record<string, string>;
    createSubscription: (
      data: unknown,
      actions: {
        subscription: {
          create: (input: {
            plan_id: string;
            custom_id: string;
          }) => Promise<string>;
        };
      },
    ) => Promise<string>;
    onApprove: (data: { subscriptionID?: string | null }) => Promise<void>;
    onCancel: () => void;
    onError: (error: unknown) => void;
  }) => PaypalButtons;
};
declare global {
  interface Window {
    paypal?: PaypalSdk;
  }
}

let sdkPromise: Promise<PaypalSdk> | null = null;

/** Loads PayPal's subscription SDK once per page load. */
function loadPaypalSdk(): Promise<PaypalSdk> {
  if (window.paypal) return Promise.resolve(window.paypal);
  sdkPromise ??= new Promise<PaypalSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;
    script.dataset.sdkIntegrationSource = "button-factory";
    script.addEventListener("load", () =>
      window.paypal
        ? resolve(window.paypal)
        : reject(new Error("PayPal SDK loaded without paypal")),
    );
    script.addEventListener("error", () => {
      // Let a later visit try again instead of caching the failure.
      sdkPromise = null;
      script.remove();
      reject(new Error("PayPal SDK failed to load"));
    });
    document.head.appendChild(script);
  });
  return sdkPromise;
}

/**
 * How a plan is paid for: Lifetime opens the client's PayPal payment link;
 * Pro renders PayPal's subscription button, tagged with this organization so
 * the client can tell whose subscription it is. A reported, unconfirmed
 * subscription replaces the button so nobody subscribes twice.
 */
export function PlanPaymentAction({ offer }: { offer: PlanOffer }) {
  const { data: account } = useQuery(billingAccountQueryOptions());

  if (offer.billing === "once") {
    return (
      <Button
        className="w-full"
        nativeButton={false}
        render={
          <a
            href={offer.paymentUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              captureClientEvent("billing:paypal_click", {
                planId: offer.planId,
              })
            }
          />
        }
      >
        Pay once with PayPal
      </Button>
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
      received. Your plan turns on once we confirm your payment. Questions?
      Email {SUPPORT_EMAIL}.
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
    let buttons: PaypalButtons | null = null;
    let cancelled = false;
    // Once PayPal's buttons are on the page they stay: an error after that
    // is one payment attempt failing, not PayPal being unavailable.
    let rendered = false;

    loadPaypalSdk()
      .then(async (paypal) => {
        if (cancelled || !containerRef.current) return;
        buttons = paypal.Buttons({
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
            // PayPal reports a closed window as an error in some flows.
            if (
              /clos/i.test(
                error instanceof Error ? error.message : String(error),
              )
            ) {
              return;
            }
            setNotice("The payment didn't go through. Please try again.");
          },
        });
        containerRef.current.replaceChildren();
        await buttons.render(containerRef.current);
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
        Subscription approved. Your plan turns on once we confirm your payment.
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
      {status === "failed" ? null : <div ref={containerRef} />}
      {notice ? (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
