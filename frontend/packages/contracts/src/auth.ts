import { z } from 'zod';

export const workspaceAccessSchema = z.object({
  status: z.enum([
    'active',
    'trial_active',
    'trial_expired',
    'subscription_lapsed',
    'access_unresolved',
  ]),
  expires_at: z.string().nullable(),
});
export const authSecuritySchema = z.object({
  email: z.string(),
  email_verified: z.boolean(),
  methods: z.array(z.string()),
});

export const policyRevisionSchema = z.object({
  terms_revision: z.string(),
  privacy_notice_revision: z.string(),
});
export const policyStatusSchema = policyRevisionSchema.extend({
  accepted_at: z.string().nullable(),
});

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

export const sessionUserSchema = responseObject({
  id: uuid(),
  email: z.email(),
  role: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const authResponseSchema = responseObject({ user: sessionUserSchema });
export const registrationResponseSchema = responseObject({ message: z.string() });

// The binding nonce travels only in an HttpOnly cookie.
export const oauthStartResponseSchema = responseObject({
  authorize_url: z.string().min(1),
  state: z.string().min(1),
});

export const oauthProvidersResponseSchema = z.object({
  providers: z.array(
    z.object({ provider: z.string(), label: z.string(), configured: z.boolean() }),
  ),
});

// Backend `WorkspaceResponse` carries the caller's membership `role` and the
// safe effective `capabilities` that role confers — capability names only,
// never a billing profile or another member's identity. Controls may be
// hidden from them; the server still enforces every denial itself.
export const workspaceSchema = responseObject({
  id: uuid(),
  name: z.string(),
  role: z.string(),
  capabilities: z.array(z.string()),
  created_at: z.string(),
  updated_at: z.string(),
});

export const workspaceMemberSchema = responseObject({
  id: uuid(),
  user_id: uuid(),
  email: z.string(),
  role: z.string(),
  is_self: z.boolean(),
  created_at: z.string(),
});

// A pending invitation. The acceptance token is never listed: only the issue
// and resend responses carry it, once.
export const workspaceInvitationSchema = responseObject({
  id: uuid(),
  workspace_id: uuid(),
  email: z.string(),
  role: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
});

export const workspaceInvitationIssuedSchema = responseObject({
  delivery: z.enum(['accepted', 'failed']).optional(),
  invitation: workspaceInvitationSchema,
  token: z.string(),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type RegistrationResponse = z.infer<typeof registrationResponseSchema>;
export type OAuthProvider = 'google';
export type OAuthStartResponse = z.infer<typeof oauthStartResponseSchema>;
export type Workspace = z.infer<typeof workspaceSchema>;
