import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { SCHEDULED_RANK_CHECKS_PAUSED } from "@/shared/rank-tracking-pause";

export function ScheduledChecksPausedAlert() {
  if (!SCHEDULED_RANK_CHECKS_PAUSED || !isHostedClientAuthMode()) return null;

  return (
    <Alert variant="warning">
      <AlertTriangle />
      <AlertDescription className="text-foreground">
        <p>
          <span className="font-medium">
            Scheduled rank tracking is paused for now.
          </span>{" "}
          Reading Google results on a schedule has been unreliable industry wide
          since recent changes at Google. You can still check your rankings any
          time with Check rankings.
        </p>
      </AlertDescription>
    </Alert>
  );
}
