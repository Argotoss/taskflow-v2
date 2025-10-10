import { z } from 'zod';
import {
  activityActionSchema,
  activityEntitySchema,
  isoDateTimeSchema,
  paginationQuerySchema,
  paginatedResponseMetaSchema,
  uuidSchema
} from './primitives.js';
import { userSummarySchema } from './user.js';

export const activityEntrySchema = z.object({
  id: uuidSchema,
  workspaceId: uuidSchema,
  actorId: uuidSchema.nullable(),
  entityType: activityEntitySchema,
  entityId: uuidSchema,
  action: activityActionSchema,
  metadata: z.record(z.any()).nullable(),
  createdAt: isoDateTimeSchema,
  actor: userSummarySchema.nullable()
});

export const activityListQuerySchema = paginationQuerySchema.extend({
  entityType: activityEntitySchema.optional(),
  entityId: uuidSchema.optional()
});

export const listActivityResponseSchema = z.object({
  data: activityEntrySchema.array(),
  meta: paginatedResponseMetaSchema
});

export type ActivityEntry = z.infer<typeof activityEntrySchema>;
