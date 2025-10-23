import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { projectApi } from './projectApi.js';
import type { ProjectSummary } from '@taskflow/types';
import { ApiError } from '../api/httpClient.js';

const buildFetchResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });

describe('projectApi', () => {
  const accessToken = 'access-token';
  const fetchMock = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists projects for a workspace', async () => {
    const data: ProjectSummary[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        workspaceId: '22222222-2222-2222-2222-222222222222',
        ownerId: '33333333-3333-3333-3333-333333333333',
        name: 'Demo Project',
        key: 'DEMO',
        description: null,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    fetchMock().mockResolvedValue(buildFetchResponse({ data, meta: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }));

    const response = await projectApi.list(accessToken, '22222222-2222-2222-2222-222222222222');

    expect(response).toEqual(data);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/workspaces/22222222-2222-2222-2222-222222222222/projects',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('creates a project', async () => {
    const project: ProjectSummary = {
      id: '33333333-3333-3333-3333-333333333333',
      workspaceId: '22222222-2222-2222-2222-222222222222',
      ownerId: '44444444-4444-4444-4444-444444444444',
      name: 'New Project',
      key: 'NEW',
      description: null,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: project }));

    const response = await projectApi.create(accessToken, project.workspaceId, { name: project.name, key: project.key });

    expect(response).toEqual(project);
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/workspaces/${project.workspaceId}/projects`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates a project', async () => {
    const project: ProjectSummary = {
      id: '55555555-5555-5555-5555-555555555555',
      workspaceId: '22222222-2222-2222-2222-222222222222',
      ownerId: '44444444-4444-4444-4444-444444444444',
      name: 'Updated Project',
      key: 'UPD',
      description: 'Updated description',
      status: 'ARCHIVED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: project }));

    const response = await projectApi.update(accessToken, project.id, {
      name: project.name,
      status: project.status,
      description: project.description
    });

    expect(response).toEqual(project);
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/projects/${project.id}`,
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('requires access token for read operations', async () => {
    await expect(() => projectApi.list(null, 'workspace')).rejects.toThrow(ApiError);
  });
});
