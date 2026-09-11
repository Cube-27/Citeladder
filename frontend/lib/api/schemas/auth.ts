import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);
const uuid = () => z.uuid();

// ---------------------------------------------------------------------------
// Auth / workspace
// ---------------------------------------------------------------------------

// Backend `SessionUser.role` is the ACCOUNT-level `User.role` (free-form
// string, defaults to `"user"` — see backend/app/models/user.py). It is a
// different axis from the per-workspace MEMBERSHIP role (`owner`/`member`,
// carried on `workspaceSchema.role` below) and must not be conflated with it
// via a restrictive enum — doing so previously rejected every real register/
// login response (`role: "user"` is not `owner|admin|member|viewer`).
export const sessionUserSchema = responseObject({
  id: uuid(),
  email: z.email(),
  role: z.string(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

// Login/me return the authenticated user; registration deliberately returns
// only an enumeration-safe acknowledgement and never creates a session.
export const authResponseSchema = responseObject({ user: sessionUserSchema });
export const registrationResponseSchema = responseObject({ message: z.string() });

// OAuth start scaffold (Phase B backend): a configured provider answers
// `{ authorize_url, state, session_nonce }`; unconfigured providers answer
// 503 before this schema is ever parsed. `session_nonce` is additive — older
// backends omit it, so it parses with a default.
export const oauthStartResponseSchema = responseObject({
  authorize_url: z.string().min(1),
  state: z.string().min(1),
  session_nonce: z.string().default(''),
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

// One membership row on the workspace roster (Owner/Admin only).
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
  invitation: workspaceInvitationSchema,
  token: z.string(),
});

// Cross-route onboarding tour state belongs to the caller's workspace
// membership, never a project or user id.
export const productTourStatusSchema = z.enum([
  'not_started',
  'in_progress',
  'completed',
  'skipped',
]);

export const productTourSchema = responseObject({
  workspace_id: uuid(),
  version: z.string(),
  status: productTourStatusSchema,
  step_id: z.string().nullable(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});
