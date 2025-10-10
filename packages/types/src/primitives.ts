import { z } from 'zod';

export const uuidSchema = z.string().uuid();
export const isoDateTimeSchema = z.string().datetime();
export const emailSchema = z.string().email();
export const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const membershipRoleSchema = z.enum(['OWNER', 'ADMIN', 'CONTRIBUTOR', 'VIEWER']);
export const projectStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);
export const taskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']);
export const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const authTokenTypeSchema = z.enum(['REFRESH', 'RESET_PASSWORD', 'WORKSPACE_INVITE']);
export const activityEntitySchema = z.enum(['WORKSPACE', 'PROJECT', 'TASK', 'COMMENT', 'ATTACHMENT', 'MEMBERSHIP']);
export const activityActionSchema = z.enum([
  'CREATED',
  'UPDATED',
  'DELETED',
  'STATUS_CHANGED',
  'ASSIGNEE_CHANGED',
  'PRIORITY_CHANGED',
  'COMMENTED',
  'ATTACHMENT_ADDED'
]);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

export const paginatedResponseMetaSchema = z.object({
  page: z.number().int().nonnegative(),
  pageSize: z.number().int().positive(),
  totalItems: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative()
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginatedResponseMeta = z.infer<typeof paginatedResponseMetaSchema>;
