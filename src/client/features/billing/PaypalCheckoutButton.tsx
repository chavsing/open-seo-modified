import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import {
  isClosedWindowError,
  loadPaypalSdk,
} from "@/client/features/billing/paypalSdk";
import { captureClientEvent } from "@/client/lib/posthog";
import { SUPPORT_EMAIL } from "@/client/lib/support";
import { queryClient } from "@/client/tanstack-db";
import {
  capturePaypalCheckoutOrder,
  createPaypalCheckoutOrder,
} from "@/serverFunctions/billing";
import type { PaypalCheckoutProduct } from "@/shared/billing";

const PAID_MESSAGES: Record<PaypalCheckoutProduct, string> = {
  pro_year: "Payment received. Your Pro Yearly plan is active.",
  lifetime: "Payment received. Lifetime access is active.",
  credit_pack: "Payment received. Your extra credits were added.",
};

type Outcome = "applied" | "needs_review" | "pending";

/**
 * PayPal's checkout for a one-time payment. The server creates the order
 * at the product's price and captures it once the customer approves, so the
 * plan or credits arrive right away. If PayPal's script can't load, the
 * product's payment link still works, matched by hand.
 */
export function PaypalCheckoutButton({
  product,
  fallbackUrl,
  fallbackLabel,
}: {
  product: PaypalCheckoutProduct;
  fallbackUrl: string;
  fallbackLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let buttons: { close: () => Promise<void> } | null = null;
    let cancelled = false;
    // Once the buttons are on the page an error is one payment attempt
    // failing, not PayPal being unavailable.
    let rendered = false;

    loadPaypalSdk("checkout")
      .then(async (paypal) => {
        if (cancelled || !containerRef.current) return;
        const instance = paypal.Buttons({
          style: { shape: "rect", color: "gold", layout: "vertical" },
          createOrder: async () => {
            setNotice(null);
            captureClientEvent("billing:paypal_click", { planId: product });
            const { orderId } = await createPaypalCheckoutOrder({
              data: { product },
            });
            return orderId;
          },
          onApprove: async (data, actions) => {
            if (!data.orderID) return;
            try {
              const result = await capturePaypalCheckoutOrder({
                data: { orderId: data.orderID },
              });
              if (result.status === "declined") {
                setNotice(
                  "PayPal declined that payment method. Please choose another one.",
                );
                await actions.restart?.();
                return;
              }
              setOutcome(result.status);
              if (result.status === "applied") {
                toast.success(PAID_MESSAGES[product]);
              }
              await queryClient.invalidateQueries({
                queryKey: billingAccountQueryOptions().queryKey,
              });
            } catch (error) {
              console.error("PayPal capture failed", error);
              setNotice(
                `We couldn't confirm the payment. If PayPal took the money, your account updates within a few minutes. Questions? Email ${SUPPORT_EMAIL}.`,
              );
            }
          },
          onCancel: () => setNotice(null),
          onError: (error) => {
            console.error("PayPal checkout button failed", error);
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
        console.error("PayPal checkout unavailable", error);
        if (!cancelled) setStatus("failed");
      });

    return () => {
      cancelled = true;
      void buttons?.close().catch(() => undefined);
    };
  }, [product]);

  if (outcome !== null) {
    return (
      <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
        {outcome === "applied"
          ? PAID_MESSAGES[product]
          : outcome === "pending"
            ? "PayPal is still processing your payment. Your account updates as soon as it clears."
            : `Payment received. We'll finish setting up your account shortly. Questions? Email ${SUPPORT_EMAIL}.`}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {status === "loading" ? <Skeleton className="h-11 w-full" /> : null}
      {status === "failed" ? (
        <Button
          variant="secondary"
          className="w-full"
          nativeButton={false}
          render={
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" />
          }
        >
          {fallbackLabel}
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
