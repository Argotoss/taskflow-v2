import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import {
  buildMembership,
  buildMembershipWithUser,
  buildMembershipWorkspaceSummary,
  buildWorkspace,
  buildWorkspaceInvite
} from '../testing/builders.js';

const userId = 'c0a80101-0000-0000-0000-000000000000';

const workspaceRecord = buildWorkspace({
  id: '11111111-1111-1111-1111-111111111111',
  ownerId: userId,
  name: 'Demo Workspace',
  slug: 'demo-workspace',
  description: 'demo',
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z')
});

describe('workspace routes', () => {
  const app = buildApp();
  const authHeaders = (): { authorization: string } => ({
    authorization: `Bearer ${app.jwt.sign({ sub: userId, type: 'access' })}`
  });

  beforeEach(async () => {
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists workspaces for the current user', async () => {
    vi.spyOn(app.prisma.membership, 'findMany').mockResolvedValue([
      buildMembershipWorkspaceSummary({
        workspace: workspaceRecord
      })
    ]);

    vi.spyOn(app.prisma.membership, 'count').mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: '/workspaces',
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.data[0]).toMatchObject({ id: workspaceRecord.id, slug: workspaceRecord.slug });
    expect(body.meta).toMatchObject({ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 });
  });

  it('creates a workspace for the current user', async () => {
    vi.spyOn(app.prisma.workspace, 'findUnique').mockResolvedValue(null);
    vi.spyOn(app.prisma.workspace, 'create').mockResolvedValue(workspaceRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: authHeaders(),
      payload: {
        name: 'Demo Workspace',
        slug: 'demo-workspace'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ id: workspaceRecord.id });
  });

  it('prevents slug collisions', async () => {
    vi.spyOn(app.prisma.workspace, 'findUnique').mockResolvedValue(workspaceRecord);

    const response = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: authHeaders(),
      payload: {
        name: 'Demo Workspace',
        slug: 'demo-workspace'
      }
    });

    expect(response.statusCode).toBe(409);
  });

  it('updates a workspace when requester is admin', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({
        id: 'mem-1',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      })
    );

    vi.spyOn(app.prisma.workspace, 'update').mockResolvedValue({
      ...workspaceRecord,
      name: 'Updated Workspace'
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/workspaces/${workspaceRecord.id}`,
      headers: authHeaders(),
      payload: {
        name: 'Updated Workspace'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.name).toBe('Updated Workspace');
  });

  it('rejects unauthorized workspace updates', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: `/workspaces/${workspaceRecord.id}`,
      headers: authHeaders(),
      payload: {
        name: 'Updated Workspace'
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it('lists workspace members', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({
        id: 'mem-1',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      })
    );

    vi.spyOn(app.prisma.membership, 'findMany').mockResolvedValue([
      buildMembershipWithUser({
        id: '22222222-2222-2222-2222-222222222222',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER',
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        user: {
          id: userId,
          email: 'ava.stewart@taskflow.app',
          name: 'Ava Stewart',
          avatarUrl: null
        }
      })
    ]);

    vi.spyOn(app.prisma.membership, 'count').mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${workspaceRecord.id}/members`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].user.email).toContain('@taskflow.app');
  });

  it('creates an invite token', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({
        id: 'mem-1',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      })
    );

    vi.spyOn(app.prisma.workspaceInvite, 'create').mockResolvedValue(
      buildWorkspaceInvite({
        workspaceId: workspaceRecord.id,
        inviterId: userId,
        email: 'new.user@taskflow.app',
        role: 'CONTRIBUTOR',
        token: crypto.randomUUID(),
        expiresAt: new Date()
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceRecord.id}/invite`,
      headers: authHeaders(),
      payload: {
        email: 'new.user@taskflow.app',
        role: 'CONTRIBUTOR'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.token).toBeDefined();
  });
});
