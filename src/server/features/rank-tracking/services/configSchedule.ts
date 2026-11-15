import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { HOSTED_DAILY_RANK_CHECKS_OFF } from "@/shared/rank-tracking-hosted";
import {
  computeNextCheckAt,
  isScheduledRankTrackingInterval,
} from "@/shared/rank-tracking";
import type {
  RankCheckScheduleTime,
  RankTrackingConfig,
} from "@/types/schemas/rank-tracking";

export async function resolveNextCheckAt(
  scheduleInterval: RankTrackingConfig["scheduleInterval"],
  scheduleTime: RankCheckScheduleTime | undefined,
): Promise<string | null> {
  if (isScheduledRankTrackingInterval(scheduleInterval)) {
    // Reached only when a schedule is created or changed, so a config keeps
    // the schedule it already has.
    if (
      scheduleInterval === "daily" &&
      HOSTED_DAILY_RANK_CHECKS_OFF &&
      (await isHostedServerAuthMode())
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Daily rank checks aren't available. Choose a weekly or monthly schedule.",
      );
    }
    // Without one the check would quietly repeat on whatever day today is.
    if (
      scheduleInterval === "weekly" &&
      scheduleTime &&
      scheduleTime.weekday === undefined
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A weekly schedule time needs a weekday",
      );
    }
    return computeNextCheckAt(scheduleInterval, null, scheduleTime);
  }
  if (scheduleTime) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A schedule time needs a daily, weekly, or monthly schedule",
    );
  }
  return null;
}
