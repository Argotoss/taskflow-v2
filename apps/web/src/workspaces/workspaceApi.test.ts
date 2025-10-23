import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workspaceApi } from './workspaceApi.js';
import type { WorkspaceSummary, MembershipSummary } from '@taskflow/types';
import { ApiError } from '../api/httpClient.js';

const buildFetchResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });

describe('workspaceApi', () => {
  const accessToken = 'access-token';
  const fetchMock = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists workspaces for current user', async () => {
    const data: WorkspaceSummary[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Demo Workspace',
        slug: 'demo-workspace',
        description: null,
        ownerId: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    fetchMock().mockResolvedValue(buildFetchResponse({ data, meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));

    const response = await workspaceApi.list(accessToken);

    expect(fetch).toHaveBeenCalledWith('http://localhost:3000/workspaces', expect.objectContaining({ method: 'GET' }));
    expect(response).toEqual(data);
  });

  it('creates a workspace', async () => {
    const workspace: WorkspaceSummary = {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'New Workspace',
      slug: 'new-workspace',
      description: null,
      ownerId: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: workspace }));

    const response = await workspaceApi.create(accessToken, { name: workspace.name, slug: workspace.slug });

    expect(response).toEqual(workspace);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/workspaces',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates workspace details', async () => {
    const workspace: WorkspaceSummary = {
      id: '33333333-3333-3333-3333-333333333333',
      name: 'Renamed Workspace',
      slug: 'renamed-workspace',
      description: 'Updated description',
      ownerId: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: workspace }));

    const response = await workspaceApi.update(accessToken, workspace.id, {
      name: workspace.name,
      description: workspace.description
    });

    expect(response).toEqual(workspace);
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/workspaces/${workspace.id}`,
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('transfers workspace ownership', async () => {
    const workspace: WorkspaceSummary = {
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      description: null,
      ownerId: '11111111-1111-1111-1111-111111111111',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: workspace }));

    const response = await workspaceApi.transfer(accessToken, workspace.id, '55555555-5555-5555-5555-555555555555');

    expect(response).toEqual(workspace);
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/workspaces/${workspace.id}/transfer`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('creates an invite and returns token', async () => {
    fetchMock().mockResolvedValue(
      buildFetchResponse({ data: { token: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } })
    );

    const token = await workspaceApi.createInvite(
      accessToken,
      '11111111-1111-1111-1111-111111111111',
      'new.member@taskflow.app',
      'CONTRIBUTOR'
    );

    expect(token).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/workspaces/11111111-1111-1111-1111-111111111111/invite',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates a member role', async () => {
    const membership: MembershipSummary = {
      id: '22222222-2222-2222-2222-222222222222',
      workspaceId: '11111111-1111-1111-1111-111111111111',
      userId: '33333333-3333-3333-3333-333333333333',
      role: 'ADMIN',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      user: {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'member@taskflow.app',
        name: 'Member',
        avatarUrl: null
      }
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: membership }));

    const updated = await workspaceApi.updateMember(
      accessToken,
      '11111111-1111-1111-1111-111111111111',
      membership.id,
      'ADMIN'
    );

    expect(updated).toEqual(membership);
  });

  it('requires access token', async () => {
    await expect(() => workspaceApi.list(null)).rejects.toThrow(ApiError);
  });
});
