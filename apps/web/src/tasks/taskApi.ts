import { z } from 'zod';
import {
  listTasksResponseSchema,
  createTaskBodySchema,
  updateTaskBodySchema,
  reorderTasksBodySchema,
  taskSummarySchema,
  type TaskSummary
} from '@taskflow/types';
import { request, authorizationHeaders, serializeBody, requireAccessToken } from '../api/httpClient.js';

type TaskStatus = TaskSummary['status'];

const taskResponseSchema = z.object({
  data: taskSummarySchema
});

const reorderResponseSchema = z.object({
  data: z.object({
    taskIds: z.array(z.string().uuid())
  })
});

export type CreateTaskInput = z.infer<typeof createTaskBodySchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskBodySchema>;
export type BoardColumnInput = { status: TaskStatus; taskIds: string[] };

export const tasksApi = {
  async list(accessToken: string | null, projectId: string): Promise<TaskSummary[]> {
    const token = requireAccessToken(accessToken);
    const response = await request(`/projects/${projectId}/tasks`, {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listTasksResponseSchema);
    return response.data;
  },
  async create(accessToken: string | null, projectId: string, payload: CreateTaskInput): Promise<TaskSummary> {
    const token = requireAccessToken(accessToken);
    const body = createTaskBodySchema.parse(payload);
    const response = await request(`/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, taskResponseSchema);
    return response.data;
  },
  async update(accessToken: string | null, taskId: string, payload: UpdateTaskInput): Promise<TaskSummary> {
    const token = requireAccessToken(accessToken);
    const body = updateTaskBodySchema.parse(payload);
    const response = await request(`/tasks/${taskId}`, {
      method: 'PATCH',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, taskResponseSchema);
    return response.data;
  },
  async reorder(accessToken: string | null, projectId: string, columns: BoardColumnInput[]): Promise<void> {
    const token = requireAccessToken(accessToken);
    const body = reorderTasksBodySchema.parse({ columns });
    await request(`/projects/${projectId}/tasks/reorder`, {
      method: 'POST',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, reorderResponseSchema);
  },
  async remove(accessToken: string | null, taskId: string): Promise<void> {
    const token = requireAccessToken(accessToken);
    await request(`/tasks/${taskId}`, {
      method: 'DELETE',
      headers: authorizationHeaders(token)
    });
  }
};
