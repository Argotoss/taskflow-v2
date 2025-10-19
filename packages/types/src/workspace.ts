import { z } from 'zod';
import {
  isoDateTimeSchema,
  membershipRoleSchema,
  paginationQuerySchema,
  paginatedResponseMetaSchema,
  slugSchema,
  uuidSchema
} from './primitives.js';
import { userSummarySchema } from './user.js';

export const workspaceSummarySchema = z.object({
  id: uuidSchema,
  name: z.string(),
  slug: slugSchema,
  description: z.string().nullable(),
  ownerId: uuidSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const membershipSummarySchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  userId: uuidSchema,
  role: membershipRoleSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  user: userSummarySchema
});

export const listWorkspacesResponseSchema = z.object({
  data: workspaceSummarySchema.array(),
  meta: paginatedResponseMetaSchema
});

export const createWorkspaceBodySchema = z.object({
  name: z.string().min(1),
  slug: slugSchema,
  description: z.string().nullish()
});

export const updateWorkspaceBodySchema = createWorkspaceBodySchema.partial();

export const listWorkspaceMembersResponseSchema = z.object({
  data: membershipSummarySchema.array(),
  meta: paginatedResponseMetaSchema
});

export const inviteMemberBodySchema = z.object({
  email: z.string().email(),
  role: membershipRoleSchema.default('CONTRIBUTOR')
});

export const updateMembershipBodySchema = z.object({
  role: membershipRoleSchema
});

export const membershipParamsSchema = z.object({
  workspaceId: uuidSchema,
  membershipId: uuidSchema
});

export const workspaceParamsSchema = z.object({
  workspaceId: uuidSchema
});

export const workspaceInviteSummarySchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  inviterId: uuidSchema,
  email: z.string().email(),
  role: membershipRoleSchema,
  token: z.string().uuid(),
  expiresAt: isoDateTimeSchema,
  acceptedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema
});

export const listWorkspaceInvitesResponseSchema = z.object({
  data: workspaceInviteSummarySchema.array()
});

export const workspaceInviteParamsSchema = z.object({
  workspaceId: uuidSchema,
  inviteId: uuidSchema
});

export const inviteTokenSchema = z.object({
  token: z.string().uuid()
});

export const workspaceListQuerySchema = paginationQuerySchema.extend({
  search: z.string().optional()
});

export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
export type MembershipSummary = z.infer<typeof membershipSummarySchema>;
export type WorkspaceInviteSummary = z.infer<typeof workspaceInviteSummarySchema>;
export type MembershipRole = z.infer<typeof membershipRoleSchema>;
