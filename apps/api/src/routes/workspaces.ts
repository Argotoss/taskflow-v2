import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@taskflow/db';
import {
  inviteMemberBodySchema,
  listWorkspaceMembersResponseSchema,
  listWorkspacesResponseSchema,
  membershipSummarySchema,
  updateWorkspaceBodySchema,
  workspaceListQuerySchema,
  workspaceParamsSchema,
  workspaceSummarySchema,
  createWorkspaceBodySchema,
  type WorkspaceSummary,
  type MembershipSummary
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

const toPagination = (page: number, pageSize: number): { skip: number; take: number } => ({
  skip: (page - 1) * pageSize,
  take: pageSize
});

export const registerWorkspaceRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/workspaces', async (request) => {
    const userId = requireUserId(request);
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
    const userId = requireUserId(request);
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
    const userId = requireUserId(request);
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
    const userId = requireUserId(request);
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
    const userId = requireUserId(request);
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

    const token = crypto.randomUUID();

    await app.prisma.workspaceInvite.create({
      data: {
        workspaceId: params.workspaceId,
        inviterId: userId,
        email: body.email,
        role: body.role ?? 'CONTRIBUTOR',
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    return { data: { token } };
  });
};
