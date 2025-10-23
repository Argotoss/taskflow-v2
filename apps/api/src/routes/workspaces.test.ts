import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@taskflow/db';
import { buildApp } from '../app.js';
import {
  buildMembership,
  buildMembershipWithUser,
  buildMembershipWorkspaceSummary,
  buildUser,
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
    ] as unknown as Awaited<ReturnType<typeof app.prisma.membership.findMany>>);

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
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
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

  it('transfers workspace ownership', async () => {
    const actorMembership = buildMembership({
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      workspaceId: workspaceRecord.id,
      userId,
      role: 'OWNER'
    });
    const targetMembership = buildMembership({
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      workspaceId: workspaceRecord.id,
      userId: '99999999-9999-9999-9999-999999999999',
      role: 'ADMIN'
    });

    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(actorMembership as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>);
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(targetMembership as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>);

    const workspaceUpdate = vi.fn().mockResolvedValue({ ...workspaceRecord, ownerId: targetMembership.userId });
    const membershipUpdate = vi.fn().mockResolvedValue(targetMembership);

    vi.spyOn(app.prisma, '$transaction').mockImplementation(async (callback) => {
      await callback({
        workspace: {
          update: workspaceUpdate
        },
        membership: {
          update: membershipUpdate
        }
      } as unknown as Prisma.TransactionClient);
      return [] as unknown as Awaited<ReturnType<typeof app.prisma.$transaction>>;
    });

    vi.spyOn(app.prisma.workspace, 'findUniqueOrThrow').mockResolvedValue({
      ...workspaceRecord,
      ownerId: targetMembership.userId
    });

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceRecord.id}/transfer`,
      headers: authHeaders(),
      payload: {
        membershipId: targetMembership.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(workspaceUpdate).toHaveBeenCalledWith({
      where: { id: workspaceRecord.id },
      data: { ownerId: targetMembership.userId }
    });
    expect(membershipUpdate).toHaveBeenCalledWith({
      where: { id: targetMembership.id },
        data: { role: 'OWNER' }
    });
    expect(membershipUpdate).toHaveBeenCalledWith({
      where: { id: actorMembership.id },
      data: { role: 'ADMIN' }
    });
  });

  it('rejects ownership transfer for non-owners', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'ADMIN'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceRecord.id}/transfer`,
      headers: authHeaders(),
      payload: {
        membershipId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns not found when membership is missing', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({
        id: 'mem-owner',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceRecord.id}/transfer`,
      headers: authHeaders(),
      payload: {
        membershipId: 'dddddddd-dddd-dddd-dddd-dddddddddddd'
      }
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects transfer when membership belongs to another workspace', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({
        id: 'mem-owner',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(
      buildMembership({
        id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        workspaceId: '33333333-3333-3333-3333-333333333333',
        userId: '99999999-9999-9999-9999-999999999999',
        role: 'ADMIN'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>
    );

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceRecord.id}/transfer`,
      headers: authHeaders(),
      payload: {
        membershipId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
      }
    });

    expect(response.statusCode).toBe(404);
  });

  it('supports transferring ownership to the current owner', async () => {
    const membership = buildMembership({
      id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      workspaceId: workspaceRecord.id,
      userId,
      role: 'OWNER'
    });

    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(membership as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>);
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(membership as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>);

    const workspaceUpdate = vi.spyOn(app.prisma.workspace, 'update').mockResolvedValue(workspaceRecord);
    const membershipUpdate = vi.spyOn(app.prisma.membership, 'update');

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceRecord.id}/transfer`,
      headers: authHeaders(),
      payload: {
        membershipId: membership.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(workspaceUpdate).toHaveBeenCalledWith({
      where: { id: workspaceRecord.id },
      data: { ownerId: membership.userId }
    });
    expect(membershipUpdate).not.toHaveBeenCalled();
  });

  it('lists workspace members', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({
        id: 'mem-1',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    vi.spyOn(app.prisma.membership, 'findMany').mockResolvedValue([
      buildMembershipWithUser({
        id: '22222222-2222-2222-2222-222222222222',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER',
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        user: buildUser({
          id: userId,
          email: 'ava.stewart@taskflow.app',
          name: 'Ava Stewart',
          avatarUrl: null
        })
      })
    ] as unknown as Awaited<ReturnType<typeof app.prisma.membership.findMany>>);

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
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'mem-1',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );
    membershipSpy.mockResolvedValueOnce(null);

    vi.spyOn(app.prisma.workspaceInvite, 'deleteMany').mockResolvedValue({ count: 0 });

    vi.spyOn(app.prisma.workspaceInvite, 'create').mockResolvedValue(
      buildWorkspaceInvite({
        workspaceId: workspaceRecord.id,
        inviterId: userId,
        email: 'new.user@taskflow.app',
        role: 'CONTRIBUTOR',
        token: crypto.randomUUID(),
        expiresAt: new Date()
      }) as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.create>>
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

  it('rejects invite creation when user already a member', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'mem-1',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'mem-2',
        workspaceId: workspaceRecord.id,
        userId: 'existing-user',
        role: 'CONTRIBUTOR'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceRecord.id}/invite`,
      headers: authHeaders(),
      payload: {
        email: 'existing@taskflow.app'
      }
    });

    expect(response.statusCode).toBe(409);
  });

  it('lists pending invites', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'mem-1',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    vi.spyOn(app.prisma.workspaceInvite, 'findMany').mockResolvedValue([
      buildWorkspaceInvite({
        workspaceId: workspaceRecord.id,
        inviterId: userId,
        email: 'pending@taskflow.app',
        token: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 3600_000)
      })
    ]);

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${workspaceRecord.id}/invites`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toHaveLength(1);
    expect(response.json().data[0].email).toBe('pending@taskflow.app');
  });

  it('cancels an invite for owners', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'mem-1',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const deleteSpy = vi.spyOn(app.prisma.workspaceInvite, 'deleteMany').mockResolvedValue({ count: 1 });

    const response = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${workspaceRecord.id}/invites/${crypto.randomUUID()}`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(204);
    expect(deleteSpy).toHaveBeenCalledWith({
      where: expect.objectContaining({
        workspaceId: workspaceRecord.id
      })
    });
  });

  it('updates member roles when requested by owner', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'owner-membership',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const membershipId = '22222222-2222-2222-2222-222222222222';
    const memberUserId = '12345678-1234-1234-1234-123456789012';
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(
      buildMembershipWithUser({
        id: membershipId,
        workspaceId: workspaceRecord.id,
        userId: memberUserId,
        role: 'CONTRIBUTOR',
        user: buildUser({
          id: memberUserId,
          email: 'member@taskflow.app',
          name: 'Member'
        })
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>
    );

    vi.spyOn(app.prisma.membership, 'count').mockResolvedValue(1);

    vi.spyOn(app.prisma.membership, 'update').mockResolvedValue(
      buildMembershipWithUser({
        id: membershipId,
        workspaceId: workspaceRecord.id,
        userId: memberUserId,
        role: 'ADMIN',
        user: buildUser({
          id: memberUserId,
          email: 'member@taskflow.app',
          name: 'Member'
        })
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.update>>
    );

    const response = await app.inject({
      method: 'PATCH',
      url: `/workspaces/${workspaceRecord.id}/members/${membershipId}`,
      headers: authHeaders(),
      payload: {
        role: 'ADMIN'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.role).toBe('ADMIN');
  });

  it('prevents demoting the last owner', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'owner-membership',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const ownerMembershipId = '33333333-3333-3333-3333-333333333333';
    const ownerUserId = '23456789-2345-2345-2345-234567890123';
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(
      buildMembershipWithUser({
        id: ownerMembershipId,
        workspaceId: workspaceRecord.id,
        userId: ownerUserId,
        role: 'OWNER',
        user: buildUser({
          id: ownerUserId,
          email: 'owner@taskflow.app',
          name: 'Owner'
        })
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>
    );

    vi.spyOn(app.prisma.membership, 'count').mockResolvedValue(1);

    const response = await app.inject({
      method: 'PATCH',
      url: `/workspaces/${workspaceRecord.id}/members/${ownerMembershipId}`,
      headers: authHeaders(),
      payload: {
        role: 'ADMIN'
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('allows owners to remove members', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'owner-membership',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const membershipId = '44444444-4444-4444-4444-444444444444';
    const removedUserId = '34567890-3456-3456-3456-345678901234';
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(
      buildMembership({
        id: membershipId,
        workspaceId: workspaceRecord.id,
        userId: removedUserId,
        role: 'CONTRIBUTOR'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>
    );

    const deleteSpy = vi.spyOn(app.prisma.membership, 'delete').mockResolvedValue(
      buildMembership({
        id: membershipId,
        workspaceId: workspaceRecord.id,
        userId: removedUserId,
        role: 'CONTRIBUTOR'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.delete>>
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${workspaceRecord.id}/members/${membershipId}`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(204);
    expect(deleteSpy).toHaveBeenCalledWith({ where: { id: membershipId } });
  });

  it('prevents removing the final owner', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: 'owner-membership',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const ownerMembershipId = '55555555-5555-5555-5555-555555555555';
    const finalOwnerUserId = '45678901-4567-4567-4567-456789012345';
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(
      buildMembership({
        id: ownerMembershipId,
        workspaceId: workspaceRecord.id,
        userId: finalOwnerUserId,
        role: 'OWNER'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>
    );

    vi.spyOn(app.prisma.membership, 'count').mockResolvedValue(1);

    const response = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${workspaceRecord.id}/members/${ownerMembershipId}`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(400);
  });

  it('allows a member to leave the workspace', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    const selfMembershipId = '66666666-6666-6666-6666-666666666666';
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: selfMembershipId,
        workspaceId: workspaceRecord.id,
        userId,
        role: 'CONTRIBUTOR'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const membershipId = selfMembershipId;
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(
      buildMembership({
        id: membershipId,
        workspaceId: workspaceRecord.id,
        userId,
        role: 'CONTRIBUTOR'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>
    );

    const deleteSpy = vi.spyOn(app.prisma.membership, 'delete').mockResolvedValue(
      buildMembership({
        id: membershipId,
        workspaceId: workspaceRecord.id,
        userId,
        role: 'CONTRIBUTOR'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.delete>>
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${workspaceRecord.id}/members/${membershipId}`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(204);
    expect(deleteSpy).toHaveBeenCalled();
  });

  it('prevents non-owners from removing other members', async () => {
    const membershipSpy = vi.spyOn(app.prisma.membership, 'findFirst');
    membershipSpy.mockResolvedValueOnce(
      buildMembership({
        id: '77777777-7777-7777-7777-777777777777',
        workspaceId: workspaceRecord.id,
        userId,
        role: 'CONTRIBUTOR'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>
    );

    const targetMembershipId = '88888888-8888-8888-8888-888888888888';
    const targetUserId = '56789012-5678-5678-5678-567890123456';
    vi.spyOn(app.prisma.membership, 'findUnique').mockResolvedValue(
      buildMembership({
        id: targetMembershipId,
        workspaceId: workspaceRecord.id,
        userId: targetUserId,
        role: 'CONTRIBUTOR'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.findUnique>>
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/workspaces/${workspaceRecord.id}/members/${targetMembershipId}`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(403);
  });
});
