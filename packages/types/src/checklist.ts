import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './primitives.js';

export const taskChecklistItemSchema = z.object({
  id: uuidSchema,
  taskId: uuidSchema,
  label: z.string(),
  position: z.number(),
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const listTaskChecklistResponseSchema = z.object({
  data: taskChecklistItemSchema.array()
});

export const createTaskChecklistItemBodySchema = z.object({
  label: z.string().min(1)
});

export const updateTaskChecklistItemBodySchema = z
  .object({
    label: z.string().min(1).optional(),
    completed: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided'
  });

export const taskChecklistItemParamsSchema = z.object({
  taskId: uuidSchema,
  itemId: uuidSchema
});

export const taskChecklistCollectionParamsSchema = z.object({
  taskId: uuidSchema
});

export type TaskChecklistItem = z.infer<typeof taskChecklistItemSchema>;
