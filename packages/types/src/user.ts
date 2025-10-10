import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema, emailSchema } from './primitives.js';

export const userSummarySchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  name: z.string(),
  avatarUrl: z.string().url().nullable()
});

export const userDetailSchema = userSummarySchema.extend({
  timezone: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export type UserSummary = z.infer<typeof userSummarySchema>;
export type UserDetail = z.infer<typeof userDetailSchema>;
