import { z } from 'zod';
import { attachmentSummarySchema, type AttachmentSummary } from '@taskflow/types';
import { request, authorizationHeaders, requireAccessToken } from '../api/httpClient.js';

const attachmentListSchema = z.object({
  data: z.array(attachmentSummarySchema)
});

export const attachmentsApi = {
  async list(accessToken: string | null, taskId: string): Promise<AttachmentSummary[]> {
    const token = requireAccessToken(accessToken);
    const response = await request(`/tasks/${taskId}/attachments`, {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, attachmentListSchema);
    return response.data;
  }
};
