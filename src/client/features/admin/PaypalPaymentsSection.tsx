import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  listAdminPaypalPayments,
  markAdminPaypalPaymentHandled,
} from "@/serverFunctions/admin";

/**
 * PayPal payments the app couldn't apply by itself: paid through an old
 * payment link, a subscription started outside the app, or a plan change it
 * refused. The admin records each by hand below, then marks it done.
 */
export function PaypalPaymentsSection() {
  const paymentsQuery = useQuery({
    queryKey: ["admin", "paypal-payments"],
    queryFn: () => listAdminPaypalPayments(),
  });
  const doneMutation = useMutation({
    mutationFn: (paymentId: string) =>
      markAdminPaypalPaymentHandled({ data: { paymentId } }),
    onSuccess: () => void paymentsQuery.refetch(),
    onError: (error) => toast.error(getStandardErrorMessage(error)),
  });

  const payments = paymentsQuery.data ?? [];
  if (payments.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-medium">PayPal payments to check</h2>
      <p className="text-sm text-muted-foreground">
        These payments arrived but didn&rsquo;t turn a plan on by themselves.
        Search for the customer below, record the payment, then click Done.
      </p>
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4 text-sm"
        >
          <div className="min-w-0 space-y-1">
            <p className="font-medium">
              {payment.productName ?? "Payment"} &middot; {payment.amount}{" "}
              {payment.currency}
            </p>
            <p className="break-words text-muted-foreground">
              {payment.payerEmail
                ? `PayPal payer: ${payment.payerEmail}`
                : "PayPal payer email unknown"}
              {payment.organizationName
                ? ` · Account: ${payment.organizationName}${payment.ownerEmail ? ` (${payment.ownerEmail})` : ""}`
                : null}
            </p>
            <p className="break-words text-muted-foreground">{payment.note}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(payment.createdAt).toLocaleString()} &middot; PayPal ID{" "}
              {payment.id}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            disabled={doneMutation.isPending}
            onClick={() => doneMutation.mutate(payment.id)}
          >
            Done
          </Button>
        </div>
      ))}
    </section>
  );
}
