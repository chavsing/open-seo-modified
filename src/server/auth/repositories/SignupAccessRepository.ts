import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { signupAllowedEmails, signupSettings } from "@/db/schema";

// The single settings row. No row means the default: invite-only.
const SETTINGS_ID = "default";

async function getInviteOnlySetting() {
  const [row] = await db
    .select({ inviteOnly: signupSettings.inviteOnly })
    .from(signupSettings)
    .where(eq(signupSettings.id, SETTINGS_ID))
    .limit(1);
  return row?.inviteOnly ?? null;
}

async function setInviteOnlySetting(args: {
  inviteOnly: boolean;
  updatedByEmail: string;
  updatedAt: string;
}) {
  await db
    .insert(signupSettings)
    .values({ id: SETTINGS_ID, ...args })
    .onConflictDoUpdate({ target: signupSettings.id, set: args });
}

async function isEmailListed(email: string) {
  const [row] = await db
    .select({ email: signupAllowedEmails.email })
    .from(signupAllowedEmails)
    .where(eq(signupAllowedEmails.email, email))
    .limit(1);
  return Boolean(row);
}

async function listAllowedEmails() {
  return db
    .select()
    .from(signupAllowedEmails)
    .orderBy(asc(signupAllowedEmails.email));
}

async function addAllowedEmail(args: {
  email: string;
  addedByEmail: string;
  createdAt: string;
}) {
  await db.insert(signupAllowedEmails).values(args).onConflictDoNothing();
}

async function removeAllowedEmail(email: string) {
  await db
    .delete(signupAllowedEmails)
    .where(eq(signupAllowedEmails.email, email));
}

export const SignupAccessRepository = {
  getInviteOnlySetting,
  setInviteOnlySetting,
  isEmailListed,
  listAllowedEmails,
  addAllowedEmail,
  removeAllowedEmail,
} as const;
