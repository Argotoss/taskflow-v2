import { z } from 'zod';
import {
  createProjectBodySchema,
  updateProjectBodySchema,
  listProjectsResponseSchema,
  projectSummarySchema,
  type ProjectSummary
} from '@taskflow/types';
import { request, authorizationHeaders, serializeBody, requireAccessToken } from '../api/httpClient.js';

const projectResponseSchema = z.object({
  data: projectSummarySchema
});

export const projectApi = {
  async list(accessToken: string | null, workspaceId: string): Promise<ProjectSummary[]> {
    const token = requireAccessToken(accessToken);
    const response = await request(`/workspaces/${workspaceId}/projects`, {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listProjectsResponseSchema);
    return response.data;
  },
  async create(
    accessToken: string | null,
    workspaceId: string,
    payload: z.infer<typeof createProjectBodySchema>
  ): Promise<ProjectSummary> {
    const token = requireAccessToken(accessToken);
    const body = createProjectBodySchema.parse(payload);
    const response = await request(`/workspaces/${workspaceId}/projects`, {
      method: 'POST',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, projectResponseSchema);
    return response.data;
  },
  async update(
    accessToken: string | null,
    projectId: string,
    payload: z.infer<typeof updateProjectBodySchema>
  ): Promise<ProjectSummary> {
    const token = requireAccessToken(accessToken);
    const body = updateProjectBodySchema.parse(payload);
    const response = await request(`/projects/${projectId}`, {
      method: 'PATCH',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, projectResponseSchema);
    return response.data;
  }
};
