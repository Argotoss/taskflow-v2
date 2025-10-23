import { z } from 'zod';
import {
  listWorkspacesResponseSchema,
  listWorkspaceMembersResponseSchema,
  listWorkspaceInvitesResponseSchema,
  inviteMemberBodySchema,
  updateMembershipBodySchema,
  createWorkspaceBodySchema,
  updateWorkspaceBodySchema,
  transferWorkspaceBodySchema,
  workspaceSummarySchema,
  type WorkspaceSummary,
  type MembershipSummary,
  type WorkspaceInviteSummary,
  type MembershipRole
} from '@taskflow/types';
import { request, authorizationHeaders, serializeBody, requireAccessToken } from '../api/httpClient.js';

const inviteResponseSchema = z.object({
  data: z.object({
    token: z.string().uuid()
  })
});

const membershipResponseSchema = z.object({
  data: listWorkspaceMembersResponseSchema.shape.data.element
});

const workspaceResponseSchema = z.object({
  data: workspaceSummarySchema
});

export const workspaceApi = {
  async list(accessToken: string | null): Promise<WorkspaceSummary[]> {
    const token = requireAccessToken(accessToken);
    const response = await request('/workspaces', {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listWorkspacesResponseSchema);
    return response.data;
  },
  async create(accessToken: string | null, payload: { name: string; slug: string; description?: string | null }): Promise<WorkspaceSummary> {
    const token = requireAccessToken(accessToken);
    const body = createWorkspaceBodySchema.parse(payload);
    const response = await request('/workspaces', {
      method: 'POST',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, workspaceResponseSchema);
    return response.data;
  },
  async update(accessToken: string | null, workspaceId: string, payload: z.infer<typeof updateWorkspaceBodySchema>): Promise<WorkspaceSummary> {
    const token = requireAccessToken(accessToken);
    const body = updateWorkspaceBodySchema.parse(payload);
    const response = await request(`/workspaces/${workspaceId}`, {
      method: 'PATCH',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, workspaceResponseSchema);
    return response.data;
  },
  async transfer(accessToken: string | null, workspaceId: string, membershipId: string): Promise<WorkspaceSummary> {
    const token = requireAccessToken(accessToken);
    const body = transferWorkspaceBodySchema.parse({ membershipId });
    const response = await request(`/workspaces/${workspaceId}/transfer`, {
      method: 'POST',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, workspaceResponseSchema);
    return response.data;
  },
  async members(accessToken: string | null, workspaceId: string): Promise<MembershipSummary[]> {
    const token = requireAccessToken(accessToken);
    const response = await request(`/workspaces/${workspaceId}/members`, {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listWorkspaceMembersResponseSchema);
    return response.data;
  },
  async invites(accessToken: string | null, workspaceId: string): Promise<WorkspaceInviteSummary[]> {
    const token = requireAccessToken(accessToken);
    const response = await request(`/workspaces/${workspaceId}/invites`, {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listWorkspaceInvitesResponseSchema);
    return response.data;
  },
  async createInvite(accessToken: string | null, workspaceId: string, email: string, role: MembershipRole): Promise<string> {
    const token = requireAccessToken(accessToken);
    const body = inviteMemberBodySchema.parse({ email, role });
    const response = await request(`/workspaces/${workspaceId}/invite`, {
      method: 'POST',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, inviteResponseSchema);
    return response.data.token;
  },
  async deleteInvite(accessToken: string | null, workspaceId: string, inviteId: string): Promise<void> {
    const token = requireAccessToken(accessToken);
    await request(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: 'DELETE',
      headers: authorizationHeaders(token)
    });
  },
  async updateMember(accessToken: string | null, workspaceId: string, membershipId: string, role: MembershipRole): Promise<MembershipSummary> {
    const token = requireAccessToken(accessToken);
    const body = updateMembershipBodySchema.parse({ role });
    const response = await request(`/workspaces/${workspaceId}/members/${membershipId}`, {
      method: 'PATCH',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, membershipResponseSchema);
    return response.data;
  },
  async removeMember(accessToken: string | null, workspaceId: string, membershipId: string): Promise<void> {
    const token = requireAccessToken(accessToken);
    await request(`/workspaces/${workspaceId}/members/${membershipId}`, {
      method: 'DELETE',
      headers: authorizationHeaders(token)
    });
  }
};
