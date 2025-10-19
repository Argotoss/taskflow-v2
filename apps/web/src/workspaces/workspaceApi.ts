import { z } from 'zod';
import {
  listWorkspacesResponseSchema,
  listWorkspaceMembersResponseSchema,
  listWorkspaceInvitesResponseSchema,
  inviteMemberBodySchema,
  updateMembershipBodySchema,
  type WorkspaceSummary,
  type MembershipSummary,
  type WorkspaceInviteSummary,
  type MembershipRole
} from '@taskflow/types';
import { request, authorizationHeaders, serializeBody, ApiError } from '../api/httpClient.js';

const inviteResponseSchema = z.object({
  data: z.object({
    token: z.string().uuid()
  })
});

const membershipResponseSchema = z.object({
  data: listWorkspaceMembersResponseSchema.shape.data.element
});

const requireToken = (token: string | null | undefined): string => {
  if (!token) {
    throw new ApiError('Authentication required', 401);
  }
  return token;
};

export const workspaceApi = {
  async list(accessToken: string | null): Promise<WorkspaceSummary[]> {
    const token = requireToken(accessToken);
    const response = await request('/workspaces', {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listWorkspacesResponseSchema);
    return response.data;
  },
  async members(accessToken: string | null, workspaceId: string): Promise<MembershipSummary[]> {
    const token = requireToken(accessToken);
    const response = await request(`/workspaces/${workspaceId}/members`, {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listWorkspaceMembersResponseSchema);
    return response.data;
  },
  async invites(accessToken: string | null, workspaceId: string): Promise<WorkspaceInviteSummary[]> {
    const token = requireToken(accessToken);
    const response = await request(`/workspaces/${workspaceId}/invites`, {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listWorkspaceInvitesResponseSchema);
    return response.data;
  },
  async createInvite(accessToken: string | null, workspaceId: string, email: string, role: MembershipRole): Promise<string> {
    const token = requireToken(accessToken);
    const body = inviteMemberBodySchema.parse({ email, role });
    const response = await request(`/workspaces/${workspaceId}/invite`, {
      method: 'POST',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, inviteResponseSchema);
    return response.data.token;
  },
  async deleteInvite(accessToken: string | null, workspaceId: string, inviteId: string): Promise<void> {
    const token = requireToken(accessToken);
    await request(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: 'DELETE',
      headers: authorizationHeaders(token)
    });
  },
  async updateMember(accessToken: string | null, workspaceId: string, membershipId: string, role: MembershipRole): Promise<MembershipSummary> {
    const token = requireToken(accessToken);
    const body = updateMembershipBodySchema.parse({ role });
    const response = await request(`/workspaces/${workspaceId}/members/${membershipId}`, {
      method: 'PATCH',
      headers: authorizationHeaders(token),
      body: serializeBody(body)
    }, membershipResponseSchema);
    return response.data;
  },
  async removeMember(accessToken: string | null, workspaceId: string, membershipId: string): Promise<void> {
    const token = requireToken(accessToken);
    await request(`/workspaces/${workspaceId}/members/${membershipId}`, {
      method: 'DELETE',
      headers: authorizationHeaders(token)
    });
  }
};
