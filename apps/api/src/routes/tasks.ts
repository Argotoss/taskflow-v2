import type { FastifyInstance } from 'fastify';
import {
  createTaskBodySchema,
  listTasksResponseSchema,
  reorderTasksBodySchema,
  taskListQuerySchema,
  taskParamsSchema,
  taskSummarySchema,
  updateTaskBodySchema,
  projectParamsSchema,
  type TaskSummary
} from '@taskflow/types';
import { requireUserId } from '../utils/current-user.js';
import type { Prisma } from '@taskflow/db';

type TaskRecord = Prisma.TaskGetPayload<{
  select: {
    id: true;
    projectId: true;
    creatorId: true;
    assigneeId: true;
    title: true;
    status: true;
    priority: true;
    sortOrder: true;
    dueDate: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

const serializeTask = (task: TaskRecord): TaskSummary =>
  taskSummarySchema.parse({
    id: task.id,
    projectId: task.projectId,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    sortOrder: Number(task.sortOrder),
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString()
  });

const ensureProjectAccess = async (
  app: FastifyInstance,
  projectId: string,
  userId: string
): Promise<{ id: string; workspaceId: string; ownerId: string }> => {
  const project = await app.prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      workspaceId: true,
      ownerId: true
    }
  });

  if (!project) {
    throw app.httpErrors.notFound('Project not found');
  }

  const membership = await app.prisma.membership.findFirst({
    where: {
      workspaceId: project.workspaceId,
      userId
    }
  });

  if (!membership) {
    throw app.httpErrors.forbidden('Insufficient permissions for project');
  }

  return project;
};

export const registerTaskRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/projects/:projectId/tasks', async (request) => {
    const userId = requireUserId(request);
    const params = projectParamsSchema.pick({ projectId: true }).parse(request.params);
    const query = taskListQuerySchema.parse(request.query ?? {});

    await ensureProjectAccess(app, params.projectId, userId);

    const skip = (query.page - 1) * query.pageSize;

    const filter = {
      projectId: params.projectId,
      status: query.status ?? undefined,
      assigneeId: query.assigneeId ?? undefined,
      priority: query.priority ?? undefined,
      title: query.search
        ? {
            contains: query.search,
            mode: 'insensitive' as const
          }
        : undefined
    };

    const [tasks, total] = await Promise.all([
      app.prisma.task.findMany({
        where: filter,
        orderBy: { sortOrder: 'asc' },
        skip,
        take: query.pageSize,
        select: {
          id: true,
          projectId: true,
          creatorId: true,
          assigneeId: true,
          title: true,
          status: true,
          priority: true,
          sortOrder: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      app.prisma.task.count({ where: filter })
    ]);

    return listTasksResponseSchema.parse({
      data: tasks.map(serializeTask),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize)
      }
    });
  });

  app.post('/projects/:projectId/tasks', async (request, reply) => {
    const userId = requireUserId(request);
    const params = projectParamsSchema.pick({ projectId: true }).parse(request.params);
    const body = createTaskBodySchema.parse(request.body);

    await ensureProjectAccess(app, params.projectId, userId);

    const task = await app.prisma.task.create({
      data: {
        projectId: params.projectId,
        creatorId: userId,
        assigneeId: body.assigneeId ?? null,
        title: body.title,
        description: body.description ?? null,
        status: body.status ?? undefined,
        priority: body.priority ?? undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        sortOrder: 0
      },
      select: {
        id: true,
        projectId: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        status: true,
        priority: true,
        sortOrder: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true
      }
    });

    reply.code(201);
    return { data: serializeTask(task) };
  });

  app.patch('/tasks/:taskId', async (request) => {
    const userId = requireUserId(request);
    const params = taskParamsSchema.parse(request.params);
    const body = updateTaskBodySchema.parse(request.body ?? {});

    const task = await app.prisma.task.findUnique({
      where: { id: params.taskId },
      select: {
        id: true,
        projectId: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        status: true,
        priority: true,
        sortOrder: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!task) {
      throw app.httpErrors.notFound('Task not found');
    }

    await ensureProjectAccess(app, task.projectId, userId);

    const updated = await app.prisma.task.update({
      where: { id: params.taskId },
      data: {
        ...body,
        assigneeId: body.assigneeId ?? undefined,
        description: body.description ?? undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : body.dueDate
      },
      select: {
        id: true,
        projectId: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        status: true,
        priority: true,
        sortOrder: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return { data: serializeTask(updated) };
  });

  app.post('/projects/:projectId/tasks/reorder', async (request) => {
    const userId = requireUserId(request);
    const params = projectParamsSchema.pick({ projectId: true }).parse(request.params);
    const body = reorderTasksBodySchema.parse(request.body);

    await ensureProjectAccess(app, params.projectId, userId);

    await app.prisma.$transaction(
      body.taskIds.map((taskId, index) =>
        app.prisma.task.update({
          where: { id: taskId },
          data: {
            sortOrder: index + 1
          }
        })
      )
    );

    return { data: { taskIds: body.taskIds } };
  });
};
