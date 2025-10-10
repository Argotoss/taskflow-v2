import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './primitives.js';
import { userSummarySchema } from './user.js';

export const attachmentSummarySchema = z.object({
  id: uuidSchema,
  taskId: uuidSchema,
  uploaderId: uuidSchema,
  fileName: z.string(),
  fileSize: z.number().int().nonnegative(),
  contentType: z.string(),
  downloadUrl: z.string().url(),
  createdAt: isoDateTimeSchema,
  uploader: userSummarySchema
});

export const attachmentParamsSchema = z.object({
  attachmentId: uuidSchema
});

export const createAttachmentBodySchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  fileSize: z.number().int().positive()
});

export const presignUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  storageKey: z.string()
});

export type AttachmentSummary = z.infer<typeof attachmentSummarySchema>;
