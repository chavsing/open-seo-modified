import { z } from "zod";
import { sendNoticeEmail } from "@/server/email/loops";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Every AI feature (articles, reviews, pictures, the assistant) stops when the
// OpenRouter account runs dry, so the admins hear about it a few days early.
const LOW_BALANCE_USD = 10;

const creditsSchema = z.object({
  data: z.object({ total_credits: z.number(), total_usage: z.number() }),
});
const keySchema = z.object({
  data: z.object({ limit_remaining: z.number().nullable().optional() }),
});

/**
 * What can still be spent: the account's balance, or less when the app's key
 * has its own spending limit. Null when OpenRouter can't be asked.
 */
export async function getOpenRouterBalance() {
  const apiKey = await getOptionalEnvValue("OPENROUTER_API_KEY");
  if (!apiKey) return null;
  const get = (path: string) =>
    fetch(`https://openrouter.ai/api/v1/${path}`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    }).then((response) => (response.ok ? response.json() : null));
  try {
    const [credits, key] = await Promise.all([get("credits"), get("key")]);
    const account = creditsSchema.safeParse(credits);
    if (!account.success) return null;
    const accountUsd =
      account.data.data.total_credits - account.data.data.total_usage;
    const keyRemaining = keySchema.safeParse(key);
    const keyUsd = keyRemaining.success
      ? (keyRemaining.data.data.limit_remaining ?? null)
      : null;
    return {
      accountUsd,
      keyUsd,
      availableUsd: keyUsd === null ? accountUsd : Math.min(accountUsd, keyUsd),
    };
  } catch {
    return null;
  }
}

/** Daily: emails the admins when less than LOW_BALANCE_USD is left. */
export async function warnIfOpenRouterLow() {
  const balance = await getOpenRouterBalance();
  if (!balance || balance.availableUsd >= LOW_BALANCE_USD) return;
  const admins = ((await getOptionalEnvValue("ADMIN_EMAILS")) ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const limitedByKey =
    balance.keyUsd !== null && balance.keyUsd < balance.accountUsd;
  const message = limitedByKey
    ? `The app's OpenRouter key has $${balance.availableUsd.toFixed(2)} left of its monthly limit. Raise the key's limit in OpenRouter, or AI writing, reviews and pictures stop when it runs out.`
    : `Your OpenRouter account has $${balance.availableUsd.toFixed(2)} left. Top it up at openrouter.ai/settings/credits, or AI writing, reviews and pictures stop when it runs out.`;
  for (const email of admins)
    await sendNoticeEmail({
      email,
      title: "AI balance is running low",
      message,
      linkUrl: "https://openrouter.ai/settings/credits",
    }).catch((error: unknown) =>
      console.error("[cron] low balance email failed", { error }),
    );
}
