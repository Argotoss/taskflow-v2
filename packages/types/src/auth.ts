import { z } from 'zod';
import { emailSchema, membershipRoleSchema, uuidSchema } from './primitives.js';
import { userDetailSchema } from './user.js';

const passwordSchema = z.string().min(4);

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1)
});

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1)
});

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive()
});

export const loginResponseSchema = z.object({
  user: userDetailSchema,
  tokens: authTokensSchema
});

export const refreshBodySchema = z.object({
  refreshToken: z.string().optional()
});

export const refreshResponseSchema = authTokensSchema;

export const forgotPasswordBodySchema = z.object({
  email: emailSchema
});

export const resetPasswordBodySchema = z.object({
  token: z.string(),
  password: passwordSchema
});

export const inviteAcceptBodySchema = z.object({
  token: z.string(),
  name: z.string().min(1),
  password: passwordSchema
});

export const invitePreviewResponseSchema = z.object({
  workspaceId: uuidSchema,
  workspaceName: z.string(),
  invitedEmail: emailSchema,
  role: membershipRoleSchema
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AuthTokens = z.infer<typeof authTokensSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type RefreshBody = z.infer<typeof refreshBodySchema>;
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordBodySchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordBodySchema>;
