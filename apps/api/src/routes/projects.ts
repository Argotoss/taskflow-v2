import type { FastifyInstance } from 'fastify';
import {
  createProjectBodySchema,
  listProjectsResponseSchema,
  projectListQuerySchema,
  projectParamsSchema,
  projectSummarySchema,
  updateProjectBodySchema,
  workspaceParamsSchema,
  type ProjectSummary
} from '@taskflow/types';
import { requireUserId } from '../utils/current-user.js';

const serializeProject = (project: {
  id: string;
  workspaceId: string;
  ownerId: string;
  name: string;
  key: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): ProjectSummary =>
  projectSummarySchema.parse({
    id: project.id,
    workspaceId: project.workspaceId,
    ownerId: project.ownerId,
    name: project.name,
    key: project.key,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  });

export const registerProjectRoutes = async (app: FastifyInstance): Promise<void> => {
  const workspaceParamSchema = workspaceParamsSchema.pick({ workspaceId: true });

  app.get('/workspaces/:workspaceId/projects', async (request) => {
    const userId = requireUserId(request);
    const params = workspaceParamSchema.parse(request.params);
    const query = projectListQuerySchema.parse(request.query ?? {});

    const membership = await app.prisma.membership.findFirst({
      where: { workspaceId: params.workspaceId, userId }
    });

    if (!membership) {
      throw app.httpErrors.forbidden('Insufficient permissions for workspace');
    }

    const skip = (query.page - 1) * query.pageSize;

    const filter = {
      workspaceId: params.workspaceId,
      status: query.status ?? undefined,
      name: query.search
        ? {
            contains: query.search,
            mode: 'insensitive' as const
          }
        : undefined
    };

    const [projects, total] = await Promise.all([
      app.prisma.project.findMany({
        where: filter,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize
      }),
      app.prisma.project.count({ where: filter })
    ]);

    return listProjectsResponseSchema.parse({
      data: projects.map(serializeProject),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize)
      }
    });
  });

  app.post('/workspaces/:workspaceId/projects', async (request, reply) => {
    const userId = requireUserId(request);
    const params = workspaceParamSchema.parse(request.params);
    const body = createProjectBodySchema.parse(request.body);

    const membership = await app.prisma.membership.findFirst({
      where: {
        workspaceId: params.workspaceId,
        userId,
        role: {
          in: ['OWNER', 'ADMIN', 'CONTRIBUTOR']
        }
      }
    });

    if (!membership) {
      throw app.httpErrors.forbidden('Insufficient permissions for workspace');
    }

    const duplicate = await app.prisma.project.findFirst({
      where: {
        workspaceId: params.workspaceId,
        key: body.key
      }
    });

    if (duplicate) {
      throw app.httpErrors.conflict('Project key already exists');
    }

    const project = await app.prisma.project.create({
      data: {
        workspaceId: params.workspaceId,
        ownerId: userId,
        name: body.name,
        key: body.key,
        description: body.description ?? null
      }
    });

    reply.code(201);
    return { data: serializeProject(project) };
  });

  app.patch('/projects/:projectId', async (request) => {
    const userId = requireUserId(request);
    const params = projectParamsSchema.parse(request.params);
    const body = updateProjectBodySchema.parse(request.body ?? {});

    const project = await app.prisma.project.findUnique({ where: { id: params.projectId } });

    if (!project) {
      throw app.httpErrors.notFound('Project not found');
    }

    const membership = await app.prisma.membership.findFirst({
      where: {
        workspaceId: project.workspaceId,
        userId,
        role: {
          in: ['OWNER', 'ADMIN', 'CONTRIBUTOR']
        }
      }
    });

    if (!membership) {
      throw app.httpErrors.forbidden('Insufficient permissions for project');
    }

    const updated = await app.prisma.project.update({
      where: { id: params.projectId },
      data: {
        ...body,
        description: body.description ?? undefined
      }
    });

    return { data: serializeProject(updated) };
  });
};
