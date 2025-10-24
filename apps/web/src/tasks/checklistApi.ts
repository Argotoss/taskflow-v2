import { z } from 'zod';
import {
  createTaskChecklistItemBodySchema,
  listTaskChecklistResponseSchema,
  taskChecklistItemSchema,
  updateTaskChecklistItemBodySchema,
  type TaskChecklistItem
} from '@taskflow/types';
import { authorizationHeaders, requireAccessToken, request, serializeBody } from '../api/httpClient.js';

export const checklistApi = {
  async list(accessToken: string | null, taskId: string): Promise<TaskChecklistItem[]> {
    const token = requireAccessToken(accessToken);
    const response = await request(
      `/tasks/${taskId}/checklist`,
      {
        method: 'GET',
        headers: authorizationHeaders(token)
      },
      listTaskChecklistResponseSchema
    );
    return response.data;
  },
  async create(accessToken: string | null, taskId: string, label: string): Promise<TaskChecklistItem> {
    const token = requireAccessToken(accessToken);
    const body = createTaskChecklistItemBodySchema.parse({ label });
    const response = await request(
      `/tasks/${taskId}/checklist`,
      {
        method: 'POST',
        headers: authorizationHeaders(token),
        body: serializeBody(body)
      },
      checklistItemResponseSchema
    );
    return response.data;
  },
  async update(
    accessToken: string | null,
    taskId: string,
    itemId: string,
    payload: { label?: string; completed?: boolean }
  ): Promise<TaskChecklistItem> {
    const token = requireAccessToken(accessToken);
    const body = updateTaskChecklistItemBodySchema.parse(payload);
    const response = await request(
      `/tasks/${taskId}/checklist/${itemId}`,
      {
        method: 'PATCH',
        headers: authorizationHeaders(token),
        body: serializeBody(body)
      },
      checklistItemResponseSchema
    );
    return response.data;
  },
  async remove(accessToken: string | null, taskId: string, itemId: string): Promise<void> {
    const token = requireAccessToken(accessToken);
    await request(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'DELETE',
      headers: authorizationHeaders(token)
    });
  }
};

const checklistItemResponseSchema = z.object({
  data: taskChecklistItemSchema
});
