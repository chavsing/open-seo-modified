// The hosted platform runs scheduled rank checks weekly or monthly, never
// daily: they are paid from the customer's credits, and a daily schedule
// spends seven times a weekly one. Free plans are skipped by the scheduler.
// Self-hosted installs keep every schedule, so every use pairs this with a
// hosted-mode check.
export const HOSTED_DAILY_RANK_CHECKS_OFF = true;
