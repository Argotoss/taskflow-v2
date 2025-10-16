import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema, emailSchema } from './primitives.js';

export const userSummarySchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  name: z.string(),
  avatarUrl: z.string().url().nullable()
});

export const notificationPreferenceSchema = z.object({
  emailMentions: z.boolean(),
  emailTaskUpdates: z.boolean(),
  inAppMentions: z.boolean(),
  inAppTaskUpdates: z.boolean()
});

export const userDetailSchema = userSummarySchema.extend({
  timezone: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  notificationPreferences: notificationPreferenceSchema
});

export const updateProfileBodySchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
  notificationPreferences: notificationPreferenceSchema.partial().optional()
});

export type UserSummary = z.infer<typeof userSummarySchema>;
export type UserDetail = z.infer<typeof userDetailSchema>;
export type NotificationPreference = z.infer<typeof notificationPreferenceSchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
