import { z } from 'zod';
import {
  listCommentsResponseSchema,
  createCommentBodySchema,
  commentSummarySchema,
  type CommentSummary
} from '@taskflow/types';
import { request, authorizationHeaders, serializeBody, requireAccessToken } from '../api/httpClient.js';

const commentResponseSchema = z.object({
  data: commentSummarySchema
});

export const commentsApi = {
  async list(accessToken: string | null, taskId: string, page = 1, pageSize = 50): Promise<CommentSummary[]> {
    const token = requireAccessToken(accessToken);
    const response = await request(`/tasks/${taskId}/comments?page=${page}&pageSize=${pageSize}`, {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listCommentsResponseSchema);
    return response.data;
  },
  async create(accessToken: string | null, taskId: string, body: string): Promise<CommentSummary> {
    const token = requireAccessToken(accessToken);
    const payload = createCommentBodySchema.parse({ body });
    const response = await request(`/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: authorizationHeaders(token),
      body: serializeBody(payload)
    }, commentResponseSchema);
    return response.data;
  }
};
