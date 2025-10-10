import { z } from 'zod';
import {
  isoDateTimeSchema,
  paginationQuerySchema,
  paginatedResponseMetaSchema,
  projectStatusSchema,
  uuidSchema
} from './primitives.js';

export const projectSummarySchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  ownerId: uuidSchema,
  name: z.string(),
  key: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const projectDetailSchema = projectSummarySchema.extend({
  archivedAt: isoDateTimeSchema.nullable()
});

export const createProjectBodySchema = z.object({
  name: z.string().min(1),
  key: z.string().regex(/^[A-Z0-9]{2,8}$/),
  description: z.string().nullish()
});

export const updateProjectBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: projectStatusSchema.optional()
});

export const projectParamsSchema = z.object({
  projectId: uuidSchema
});

export const projectListQuerySchema = paginationQuerySchema.extend({
  status: projectStatusSchema.optional(),
  search: z.string().optional()
});

export const listProjectsResponseSchema = z.object({
  data: projectSummarySchema.array(),
  meta: paginatedResponseMetaSchema
});

export type ProjectSummary = z.infer<typeof projectSummarySchema>;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;
