import { z } from 'zod';
import { isoDateTimeSchema, paginationQuerySchema, paginatedResponseMetaSchema, uuidSchema } from './primitives.js';
import { userSummarySchema } from './user.js';

export const commentSummarySchema = z.object({
  id: uuidSchema,
  taskId: uuidSchema,
  authorId: uuidSchema,
  body: z.string(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  author: userSummarySchema
});

export const createCommentBodySchema = z.object({
  body: z.string().min(1)
});

export const commentParamsSchema = z.object({
  commentId: uuidSchema
});

export const listCommentsResponseSchema = z.object({
  data: commentSummarySchema.array(),
  meta: paginatedResponseMetaSchema
});

export const commentListQuerySchema = paginationQuerySchema;

export type CommentSummary = z.infer<typeof commentSummarySchema>;
