import { z } from 'zod';

const email = () => z.email().trim().max(255);
const returnTo = () => z.string().max(1024).optional();
const password = () => z.string();
const turnstileToken = () => z.string().optional();

export const termsDecisionRequestSchema = z.object({
  terms_revision: z.string().min(1).max(64),
  accept_terms: z.literal(true),
});
export type TermsDecisionRequest = z.input<typeof termsDecisionRequestSchema>;

export const passwordConfirmationRequestSchema = z.object({ password: password() });
export type PasswordConfirmationRequest = z.input<typeof passwordConfirmationRequestSchema>;

export const accountEntryRequestSchema = z
  .object({
    return_to: returnTo(),
    email: email(),
    password: password(),
    turnstile_token: turnstileToken(),
  })
  .extend(termsDecisionRequestSchema.shape);
export type AccountEntryRequest = z.input<typeof accountEntryRequestSchema>;

export const mailboxLinkRequestSchema = z.object({
  email: email(),
  return_to: returnTo(),
  turnstile_token: turnstileToken(),
});
export type MailboxLinkRequest = z.input<typeof mailboxLinkRequestSchema>;

export const mailboxChallengeRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: password(),
});
export type MailboxChallengeRequest = z.input<typeof mailboxChallengeRequestSchema>;

export const passwordChangeRequestSchema = z.object({
  current_password: password(),
  password: password(),
});
export type PasswordChangeRequest = z.input<typeof passwordChangeRequestSchema>;

export const workspaceCreateRequestSchema = termsDecisionRequestSchema.extend({
  name: z.string().trim().min(1).max(255),
});
export type WorkspaceCreateRequest = z.input<typeof workspaceCreateRequestSchema>;

export const invitationAcceptRequestSchema = z.object({ token: z.string().min(16).max(256) });
export type InvitationAcceptRequest = z.input<typeof invitationAcceptRequestSchema>;

const assignableRole = () => z.string();

export const memberRoleUpdateRequestSchema = z.object({ role: assignableRole() });
export type MemberRoleUpdateRequest = z.input<typeof memberRoleUpdateRequestSchema>;

export const ownershipTransferRequestSchema = z.object({ member_id: z.uuid() });
export type OwnershipTransferRequest = z.input<typeof ownershipTransferRequestSchema>;

export const invitationCreateRequestSchema = z.object({ email: email(), role: assignableRole() });
export type InvitationCreateRequest = z.input<typeof invitationCreateRequestSchema>;
