import { TableCard } from "@/client/components/ui/table";
import { BillingFeatureBreakdown } from "@/client/features/billing/BillingFeatureBreakdown";
import { BillingUsageChart } from "@/client/features/billing/BillingUsageChart";

/** The billing page's usage: credits spent per day and per feature. */
export function BillingUsageCard() {
  return (
    <TableCard>
      <div className="space-y-6 p-4">
        <BillingUsageChart />
        <BillingFeatureBreakdown />
      </div>
    </TableCard>
  );
}
