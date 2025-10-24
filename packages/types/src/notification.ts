import { z } from 'zod';
import { isoDateTimeSchema, paginationQuerySchema, paginatedResponseMetaSchema, uuidSchema } from './primitives.js';

export const notificationSummarySchema = z.object({
  id: uuidSchema,
  userId: uuidSchema,
  type: z.string(),
  payload: z.any(),
  readAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema
});

export const listNotificationsResponseSchema = z.object({
  data: notificationSummarySchema.array(),
  meta: paginatedResponseMetaSchema
});

export const notificationListQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.coerce.boolean().optional()
});

export const markNotificationReadResponseSchema = z.object({
  data: notificationSummarySchema
});

export type NotificationSummary = z.infer<typeof notificationSummarySchema>;
