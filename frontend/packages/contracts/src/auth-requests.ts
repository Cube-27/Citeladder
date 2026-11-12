/**
 * Request bodies of sign-in, sign-up, the mailbox links and workspace
 * membership. These own the wire shape; the API `.extend`s each with its
 * configured password and Turnstile-token bounds and its configured roles,
 * and the browser types its arguments as `z.input` of them.
 */
import { z } from 'zod';

const email = () => z.email().trim().max(255);
const returnTo = () => z.string().max(1024).optional();
/** An account password; its length bounds are the server's secret policy. */
const password = () => z.string();
/** The Turnstile token solved on the form; its length bound is server configuration. */
const turnstileToken = () => z.string().optional();

/** Accepting the published Terms revision the person was shown. */
export const termsDecisionRequestSchema = z.object({
  terms_revision: z.string().min(1).max(64),
  accept_terms: z.literal(true),
});
export type TermsDecisionRequest = z.input<typeof termsDecisionRequestSchema>;

/** The signed-in person's current password, confirming a sensitive change. */
export const passwordConfirmationRequestSchema = z.object({ password: password() });
export type PasswordConfirmationRequest = z.input<typeof passwordConfirmationRequestSchema>;

/**
 * Signing in is also a Terms decision: the request must carry it. After
 * repeated failures sign-in is challenged, and then it also carries the
 * Turnstile token solved on the form.
 */
export const signInRequestSchema = z
  .object({
    return_to: returnTo(),
    email: email(),
    password: password(),
    turnstile_token: turnstileToken(),
  })
  .extend(termsDecisionRequestSchema.shape);
export type SignInRequest = z.input<typeof signInRequestSchema>;

/** Sign-up has sign-in's shape, and it is always challenged. */
export const signUpRequestSchema = signInRequestSchema;
export type SignUpRequest = z.input<typeof signUpRequestSchema>;

/** Asking for an email link (verification or password reset); the request is challenged. */
export const mailboxLinkRequestSchema = z.object({
  email: email(),
  return_to: returnTo(),
  turnstile_token: turnstileToken(),
});
export type MailboxLinkRequest = z.input<typeof mailboxLinkRequestSchema>;

/** Confirming an email link: its token proves the mailbox, and sets the password. */
export const mailboxChallengeRequestSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: password(),
});
export type MailboxChallengeRequest = z.input<typeof mailboxChallengeRequestSchema>;

/** A signed-in password change. */
export const passwordChangeRequestSchema = z.object({
  current_password: password(),
  password: password(),
});
export type PasswordChangeRequest = z.input<typeof passwordChangeRequestSchema>;

/** The caller's own new workspace, accepting the Terms revision they were shown. */
export const workspaceCreateRequestSchema = termsDecisionRequestSchema.extend({
  name: z.string().trim().min(1).max(255),
});
export type WorkspaceCreateRequest = z.input<typeof workspaceCreateRequestSchema>;

/** Joining an invited workspace; the token names the workspace. */
export const invitationAcceptRequestSchema = z.object({ token: z.string().min(16).max(256) });
export type InvitationAcceptRequest = z.input<typeof invitationAcceptRequestSchema>;

/** A role an invitation or role change names; the assignable set is workspace policy. */
const assignableRole = () => z.string();

export const memberRoleUpdateRequestSchema = z.object({ role: assignableRole() });
export type MemberRoleUpdateRequest = z.input<typeof memberRoleUpdateRequestSchema>;

/** Moving the Owner designation to another member. */
export const ownershipTransferRequestSchema = z.object({ member_id: z.uuid() });
export type OwnershipTransferRequest = z.input<typeof ownershipTransferRequestSchema>;

export const invitationCreateRequestSchema = z.object({ email: email(), role: assignableRole() });
export type InvitationCreateRequest = z.input<typeof invitationCreateRequestSchema>;
