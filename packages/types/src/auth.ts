import { z } from 'zod';
import { emailSchema, membershipRoleSchema, uuidSchema } from './primitives.js';
import { userDetailSchema } from './user.js';

export const registerBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(12),
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
  refreshToken: z.string()
});

export const refreshResponseSchema = authTokensSchema;

export const forgotPasswordBodySchema = z.object({
  email: emailSchema
});

export const resetPasswordBodySchema = z.object({
  token: z.string(),
  password: z.string().min(12)
});

export const inviteAcceptBodySchema = z.object({
  token: z.string(),
  name: z.string().min(1),
  password: z.string().min(12)
});

export const invitePreviewResponseSchema = z.object({
  workspaceId: uuidSchema,
  workspaceName: z.string(),
  invitedEmail: emailSchema,
  role: membershipRoleSchema
});
