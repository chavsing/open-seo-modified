const LOOPS_CONTACT_UPDATE_URL = "https://app.loops.so/api/v1/contacts/update";

type LoopsContactProperty =
  | string
  | number
  | boolean
  | null
  | undefined
  | Record<string, boolean>;

type LoopsContactUpdatePayload = {
  email?: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  source?: string;
  subscribed?: boolean;
  userGroup?: string;
  mailingLists?: Record<string, boolean>;
} & Record<string, LoopsContactProperty>;

export async function updateLoopsContact({
  apiKey,
  payload,
  logContext,
}: {
  apiKey: string;
  payload: LoopsContactUpdatePayload;
  logContext?: Record<string, unknown>;
}) {
  await loopsRequest({
    apiKey,
    method: "PUT",
    url: LOOPS_CONTACT_UPDATE_URL,
    payload,
    label: "update Loops contact",
    logContext,
  });
}

async function loopsRequest({
  apiKey,
  method,
  url,
  payload,
  headers,
  okStatuses = [],
  label,
  logContext,
}: {
  apiKey: string;
  method: "PUT" | "POST";
  url: string;
  payload: { email?: string; userId?: string };
  headers?: Record<string, string>;
  okStatuses?: number[];
  label: string;
  logContext?: Record<string, unknown>;
}) {
  const response = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...headers,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok || okStatuses.includes(response.status)) {
    return response.status;
  }

  const errorPayload = await response.json().catch(() => null);
  console.warn(`Loops error (${label}):`, {
    status: response.status,
    email: payload.email,
    userId: payload.userId,
    ...logContext,
    errorPayload,
  });

  throw new Error(`Failed to ${label} (${response.status})`);
}

export function getContactNameParts(name: string | null | undefined) {
  const trimmedName = name?.trim();

  if (!trimmedName) {
    return {};
  }

  const [firstName, ...lastNameParts] = trimmedName.split(/\s+/);
  const lastName = lastNameParts.join(" ");

  return {
    firstName,
    ...(lastName ? { lastName } : {}),
  };
}
