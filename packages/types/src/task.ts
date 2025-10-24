import { z } from 'zod';
import {
  isoDateTimeSchema,
  paginationQuerySchema,
  paginatedResponseMetaSchema,
  taskPrioritySchema,
  taskStatusSchema,
  uuidSchema
} from './primitives.js';
import { userSummarySchema } from './user.js';
import { commentSummarySchema } from './comment.js';
import { attachmentSummarySchema } from './attachment.js';
import { taskChecklistItemSchema } from './checklist.js';

export const taskSummarySchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  creatorId: uuidSchema,
  assigneeId: uuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  sortOrder: z.number(),
  dueDate: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  checklistCompletedCount: z.number().nonnegative(),
  checklistTotalCount: z.number().nonnegative()
});

export const taskDetailSchema = taskSummarySchema.extend({
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  creator: userSummarySchema,
  assignee: userSummarySchema.nullable(),
  checklist: taskChecklistItemSchema.array(),
  comments: commentSummarySchema.array(),
  attachments: attachmentSummarySchema.array()
});

export const createTaskBodySchema = z.object({
  title: z.string().min(1),
  description: z.string().nullish(),
  assigneeId: uuidSchema.nullable().optional(),
  priority: taskPrioritySchema.optional(),
  dueDate: isoDateTimeSchema.nullable().optional(),
  status: taskStatusSchema.optional()
});

export const updateTaskBodySchema = createTaskBodySchema.partial().extend({
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  sortOrder: z.number().optional()
});

export const reorderTasksBodySchema = z.object({
  columns: z
    .array(
      z.object({
        status: taskStatusSchema,
        taskIds: uuidSchema.array()
      })
    )
    .nonempty()
});

export const taskParamsSchema = z.object({
  taskId: uuidSchema
});

export const taskListQuerySchema = paginationQuerySchema.extend({
  status: taskStatusSchema.optional(),
  assigneeId: uuidSchema.optional(),
  priority: taskPrioritySchema.optional(),
  search: z.string().optional()
});

export const listTasksResponseSchema = z.object({
  data: taskSummarySchema.array(),
  meta: paginatedResponseMetaSchema
});

export type TaskSummary = z.infer<typeof taskSummarySchema>;
export type TaskDetail = z.infer<typeof taskDetailSchema>;
export type TaskStatus = z.infer<typeof taskStatusSchema>;
export type TaskPriority = z.infer<typeof taskPrioritySchema>;
