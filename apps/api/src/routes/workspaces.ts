import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@taskflow/db';
import {
  inviteMemberBodySchema,
  listWorkspaceMembersResponseSchema,
  listWorkspacesResponseSchema,
  membershipParamsSchema,
  membershipSummarySchema,
  updateMembershipBodySchema,
  updateWorkspaceBodySchema,
  transferWorkspaceBodySchema,
  workspaceInviteParamsSchema,
  workspaceInviteSummarySchema,
  listWorkspaceInvitesResponseSchema,
  workspaceListQuerySchema,
  workspaceParamsSchema,
  workspaceSummarySchema,
  createWorkspaceBodySchema,
  type WorkspaceSummary,
  type MembershipSummary,
  type WorkspaceInviteSummary
} from '@taskflow/types';
import { requireUserId } from '../utils/current-user.js';

const paginationDefaults = workspaceListQuerySchema.parse({});

const serializeWorkspace = (workspace: {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}): WorkspaceSummary =>
  workspaceSummarySchema.parse({
    id: workspace.id,
    ownerId: workspace.ownerId,
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString()
  });

const serializeMembership = (membership: {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}): MembershipSummary =>
  membershipSummarySchema.parse({
    id: membership.id,
    workspaceId: membership.workspaceId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    updatedAt: membership.updatedAt.toISOString(),
    user: {
      id: membership.user.id,
      email: membership.user.email,
      name: membership.user.name,
      avatarUrl: membership.user.avatarUrl
    }
  });

const serializeInvite = (invite: {
  id: string;
  workspaceId: string;
  inviterId: string;
  email: string;
  role: string;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}): WorkspaceInviteSummary =>
  workspaceInviteSummarySchema.parse({
    id: invite.id,
    workspaceId: invite.workspaceId,
    inviterId: invite.inviterId,
    email: invite.email,
    role: invite.role,
    token: invite.token,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt ? invite.acceptedAt.toISOString() : null,
    createdAt: invite.createdAt.toISOString()
  });

const toPagination = (page: number, pageSize: number): { skip: number; take: number } => ({
  skip: (page - 1) * pageSize,
  take: pageSize
});

export const registerWorkspaceRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/workspaces', async (request) => {
    const userId = await requireUserId(request);
    const query = workspaceListQuerySchema.parse(request.query ?? {});

    const { skip, take } = toPagination(query.page, query.pageSize);

    const membershipFilter: Prisma.MembershipWhereInput = {
      userId,
      workspace: query.search
        ? {
            is: {
              name: {
                contains: query.search,
                mode: 'insensitive' as const
              }
            }
          }
        : undefined
    };

    const [memberships, total] = await Promise.all([
      app.prisma.membership.findMany({
        where: membershipFilter,
        select: {
          workspace: {
            select: {
              id: true,
              ownerId: true,
              name: true,
              slug: true,
              description: true,
              createdAt: true,
              updatedAt: true
            }
          }
        },
        orderBy: {
          workspace: {
            createdAt: 'desc'
          }
        },
        skip,
        take
      }),
      app.prisma.membership.count({ where: membershipFilter })
    ]);

    const data = memberships.map((membership) => serializeWorkspace(membership.workspace));

    return listWorkspacesResponseSchema.parse({
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize)
      }
    });
  });

  app.post('/workspaces', async (request, reply) => {
    const userId = await requireUserId(request);
    const body = createWorkspaceBodySchema.parse(request.body);

    const existing = await app.prisma.workspace.findUnique({
      where: { slug: body.slug }
    });

    if (existing) {
      throw app.httpErrors.conflict('Workspace slug already in use');
    }

    const workspace = await app.prisma.workspace.create({
      data: {
        name: body.name,
        description: body.description ?? null,
        slug: body.slug,
        ownerId: userId,
        memberships: {
          create: {
            userId,
            role: 'OWNER'
          }
        }
      }
    });

    reply.code(201);
    return { data: serializeWorkspace(workspace) };
  });

  app.patch('/workspaces/:workspaceId', async (request) => {
    const userId = await requireUserId(request);
    const params = workspaceParamsSchema.parse(request.params);
    const body = updateWorkspaceBodySchema.parse(request.body ?? {});

    const membership = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId,
        role: {
          in: ['OWNER', 'ADMIN']
        }
      }
    });

    if (!membership) {
      throw app.httpErrors.forbidden('Insufficient permissions for workspace');
    }

    const workspace = await app.prisma.workspace.update({
      where: { id: params.workspaceId },
      data: {
        ...body,
        description: body.description ?? undefined
      }
    });

    return { data: serializeWorkspace(workspace) };
  });

  app.get('/workspaces/:workspaceId/members', async (request) => {
    const userId = await requireUserId(request);
    const params = workspaceParamsSchema.parse(request.params);
    const query = workspaceListQuerySchema.parse(request.query ?? paginationDefaults);

    const membership = await app.prisma.membership.findFirst({
      where: { workspaceId: params.workspaceId, userId }
    });

    if (!membership) {
      throw app.httpErrors.forbidden('Insufficient permissions for workspace');
    }

    const { skip, take } = toPagination(query.page, query.pageSize);

    const [members, total] = await Promise.all([
      app.prisma.membership.findMany({
        where: { workspaceId: params.workspaceId },
        select: {
          id: true,
          workspaceId: true,
          userId: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true
            }
          }
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take
      }),
      app.prisma.membership.count({ where: { workspaceId: params.workspaceId } })
    ]);

    const data = members.map((member) => serializeMembership(member));

    return listWorkspaceMembersResponseSchema.parse({
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize)
      }
    });
  });

  app.post('/workspaces/:workspaceId/invite', async (request) => {
    const userId = await requireUserId(request);
    const params = workspaceParamsSchema.parse(request.params);
    const body = inviteMemberBodySchema.parse(request.body);

    const inviter = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId,
        role: {
          in: ['OWNER', 'ADMIN']
        }
      }
    });

    if (!inviter) {
      throw app.httpErrors.forbidden('Insufficient permissions to invite members');
    }

    const emailLower = body.email.trim().toLowerCase();

    const existingMembership = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        user: {
          email: emailLower
        }
      }
    });

    if (existingMembership) {
      throw app.httpErrors.conflict('User is already a member of this workspace');
    }

    await app.prisma.workspaceInvite.deleteMany({
      where: {
        workspaceId: params.workspaceId,
        email: emailLower,
        acceptedAt: null
      }
    });

    const token = crypto.randomUUID();
    const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await app.prisma.workspaceInvite.create({
      data: {
        workspaceId: params.workspaceId,
        inviterId: userId,
        email: emailLower,
        role: body.role ?? 'CONTRIBUTOR',
        token,
        expiresAt: expiry
      }
    });

    return { data: { token } };
  });

  app.get('/workspaces/:workspaceId/invites', async (request) => {
    const userId = await requireUserId(request);
    const params = workspaceParamsSchema.parse(request.params);

    const inviter = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId,
        role: {
          in: ['OWNER', 'ADMIN']
        }
      }
    });

    if (!inviter) {
      throw app.httpErrors.forbidden('Insufficient permissions to view invites');
    }

    const invites = await app.prisma.workspaceInvite.findMany({
      where: {
        workspaceId: params.workspaceId,
        acceptedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const data = invites.map((invite) => serializeInvite(invite));

    return listWorkspaceInvitesResponseSchema.parse({ data });
  });

  app.delete('/workspaces/:workspaceId/invites/:inviteId', async (request, reply) => {
    const userId = await requireUserId(request);
    const params = workspaceInviteParamsSchema.parse(request.params);

    const inviter = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId,
        role: {
          in: ['OWNER', 'ADMIN']
        }
      }
    });

    if (!inviter) {
      throw app.httpErrors.forbidden('Insufficient permissions to delete invites');
    }

    await app.prisma.workspaceInvite.deleteMany({
      where: {
        id: params.inviteId,
        workspaceId: params.workspaceId
      }
    });

    reply.code(204);
    return null;
  });

  app.post('/workspaces/:workspaceId/transfer', async (request) => {
    const userId = await requireUserId(request);
    const params = workspaceParamsSchema.parse(request.params);
    const body = transferWorkspaceBodySchema.parse(request.body);

    const actor = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId
      }
    });

    if (!actor || actor.role !== 'OWNER') {
      throw app.httpErrors.forbidden('Only workspace owners can transfer ownership');
    }

    const targetMembership = await app.prisma.membership.findUnique({
      where: { id: body.membershipId }
    });

    if (!targetMembership || targetMembership.workspaceId !== params.workspaceId) {
      throw app.httpErrors.notFound('Membership not found');
    }

    if (targetMembership.userId === actor.userId) {
      const workspace = await app.prisma.workspace.update({
        where: { id: params.workspaceId },
        data: {
          ownerId: targetMembership.userId
        }
      });

      return { data: serializeWorkspace(workspace) };
    }

    await app.prisma.$transaction(async (tx) => {
      await tx.workspace.update({
        where: { id: params.workspaceId },
        data: {
          ownerId: targetMembership.userId
        }
      });

      await tx.membership.update({
        where: { id: targetMembership.id },
        data: {
          role: 'OWNER'
        }
      });

      await tx.membership.update({
        where: { id: actor.id },
        data: {
          role: 'ADMIN'
        }
      });
    });

    const workspace = await app.prisma.workspace.findUniqueOrThrow({
      where: { id: params.workspaceId }
    });

    return { data: serializeWorkspace(workspace) };
  });

  app.patch('/workspaces/:workspaceId/members/:membershipId', async (request) => {
    const userId = await requireUserId(request);
    const params = membershipParamsSchema.parse(request.params);
    const body = updateMembershipBodySchema.parse(request.body);

    const actorMembership = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId
      }
    });

    if (!actorMembership || actorMembership.role !== 'OWNER') {
      throw app.httpErrors.forbidden('Only workspace owners can update member roles');
    }

    const target = await app.prisma.membership.findUnique({
      where: {
        id: params.membershipId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    if (!target || target.workspaceId !== params.workspaceId) {
      throw app.httpErrors.notFound('Membership not found');
    }

    if (target.role === 'OWNER' && body.role !== 'OWNER') {
      const ownerCount = await app.prisma.membership.count({
        where: {
          workspaceId: params.workspaceId,
          role: 'OWNER'
        }
      });

      if (ownerCount <= 1) {
        throw app.httpErrors.badRequest('Workspace requires at least one owner');
      }
    }

    const updated = await app.prisma.membership.update({
      where: { id: params.membershipId },
      data: {
        role: body.role
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    return { data: serializeMembership(updated) };
  });

  app.delete('/workspaces/:workspaceId/members/:membershipId', async (request, reply) => {
    const userId = await requireUserId(request);
    const params = membershipParamsSchema.parse(request.params);

    const target = await app.prisma.membership.findUnique({
      where: {
        id: params.membershipId
      }
    });

    if (!target || target.workspaceId !== params.workspaceId) {
      throw app.httpErrors.notFound('Membership not found');
    }

    const actor = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId
      }
    });

    if (!actor) {
      throw app.httpErrors.forbidden('Insufficient permissions for workspace');
    }

    const isSelf = actor.id === target.id;
    const isOwner = actor.role === 'OWNER';

    if (!isSelf && !isOwner) {
      throw app.httpErrors.forbidden('Only owners can remove other members');
    }

    if (target.role === 'OWNER') {
      const ownerCount = await app.prisma.membership.count({
        where: {
          workspaceId: params.workspaceId,
          role: 'OWNER'
        }
      });
      if (ownerCount <= 1) {
        throw app.httpErrors.badRequest('Workspace requires at least one owner');
      }
    }

    await app.prisma.membership.delete({
      where: {
        id: params.membershipId
      }
    });

    reply.code(204);
    return null;
  });

};
