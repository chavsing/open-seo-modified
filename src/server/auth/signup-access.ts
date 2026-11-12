import { isPlatformAdmin, requireAdmin } from "@/server/billing/admin-billing";
import { getBillingAccountRow } from "@/server/billing/creditLedger";
import { hasPaidAccess } from "@/server/billing/plan-access";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { SignupAccessRepository } from "@/server/auth/repositories/SignupAccessRepository";

// Invite-only sign-up (hosted): while it is on, a new account can only be
// created for an email the admin listed, an admin email, or an email with a
// pending team invitation from a paying account (so customers can still invite
// teammates). Any account can create invitations, so an invitation from a free
// account would let anyone in. It only gates creating accounts; existing
// accounts sign in as before.

const normalize = (email: string) => email.trim().toLowerCase();

async function isInviteOnly() {
  return (await SignupAccessRepository.getInviteOnlySetting()) ?? true;
}

/** Whether a new account may be created for this email. */
export async function canEmailSignUp(email: string) {
  const normalized = normalize(email);
  if (!(await isInviteOnly())) return true;
  if (await SignupAccessRepository.isEmailListed(normalized)) return true;
  if (await isPlatformAdmin(normalized)) return true;
  return hasInvitationFromPayingAccount(normalized);
}

async function hasInvitationFromPayingAccount(email: string) {
  const organizationIds =
    await AuthRepository.listPendingInvitationOrganizationIds(email);
  for (const organizationId of organizationIds) {
    if (hasPaidAccess(await getBillingAccountRow(organizationId))) return true;
  }
  return false;
}

export async function getSignupAccessAsAdmin(adminEmail: string) {
  await requireAdmin(adminEmail);
  const [inviteOnly, emails] = await Promise.all([
    isInviteOnly(),
    SignupAccessRepository.listAllowedEmails(),
  ]);
  return { inviteOnly, emails };
}

export async function setInviteOnlyAsAdmin(
  adminEmail: string,
  inviteOnly: boolean,
) {
  await requireAdmin(adminEmail);
  await SignupAccessRepository.setInviteOnlySetting({
    inviteOnly,
    updatedByEmail: adminEmail,
    updatedAt: new Date().toISOString(),
  });
}

export async function addAllowedEmailAsAdmin(
  adminEmail: string,
  email: string,
) {
  await requireAdmin(adminEmail);
  await SignupAccessRepository.addAllowedEmail({
    email: normalize(email),
    addedByEmail: adminEmail,
    createdAt: new Date().toISOString(),
  });
}

export async function removeAllowedEmailAsAdmin(
  adminEmail: string,
  email: string,
) {
  await requireAdmin(adminEmail);
  await SignupAccessRepository.removeAllowedEmail(normalize(email));
}
