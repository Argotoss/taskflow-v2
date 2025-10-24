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
import { Prisma } from '@taskflow/db';
import { ensureProjectAccess } from '../utils/project-access.js';

type TaskRecord = Prisma.TaskGetPayload<{
  select: {
    id: true;
    projectId: true;
    creatorId: true;
    assigneeId: true;
    title: true;
    description: true;
    status: true;
    priority: true;
    sortOrder: true;
    dueDate: true;
    createdAt: true;
    updatedAt: true;
    checklistItems: {
      select: {
        id: true;
        completedAt: true;
      };
    };
  };
}>;

type TaskStatus = TaskSummary['status'];

const boardStatuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED'];

const serializeTask = (task: TaskRecord): TaskSummary => {
  const checklistItems = task.checklistItems ?? [];
  const checklistTotal = checklistItems.length;
  const checklistCompleted = checklistItems.filter((item) => item.completedAt).length;
  return taskSummarySchema.parse({
    id: task.id,
    projectId: task.projectId,
    creatorId: task.creatorId,
    assigneeId: task.assigneeId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    sortOrder: Number(task.sortOrder),
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    checklistCompletedCount: checklistCompleted,
    checklistTotalCount: checklistTotal
  });
};

export const registerTaskRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/projects/:projectId/tasks', async (request) => {
    const userId = await requireUserId(request);
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
          description: true,
          status: true,
          priority: true,
          sortOrder: true,
          dueDate: true,
          createdAt: true,
          updatedAt: true,
          checklistItems: {
            select: {
              id: true,
              completedAt: true
            }
          }
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
    const userId = await requireUserId(request);
    const params = projectParamsSchema.pick({ projectId: true }).parse(request.params);
    const body = createTaskBodySchema.parse(request.body);

    await ensureProjectAccess(app, params.projectId, userId);

    const status = (body.status ?? 'TODO') as TaskStatus;
    const aggregate = await app.prisma.task.aggregate({
      where: { projectId: params.projectId },
      _max: { sortOrder: true }
    });
    const nextSortOrder = new Prisma.Decimal((aggregate._max.sortOrder?.toNumber() ?? 0) + 1);

    const task = await app.prisma.task.create({
      data: {
        projectId: params.projectId,
        creatorId: userId,
        assigneeId: body.assigneeId ?? null,
        title: body.title,
        description: body.description ?? null,
        status,
        priority: body.priority ?? undefined,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        sortOrder: nextSortOrder
      },
      select: {
        id: true,
        projectId: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        sortOrder: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        checklistItems: {
          select: {
            id: true,
            completedAt: true
          }
        }
      }
    });

    reply.code(201);
    return { data: serializeTask(task) };
  });

  app.patch('/tasks/:taskId', async (request) => {
    const userId = await requireUserId(request);
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
        description: true,
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

    const updateData: Prisma.TaskUncheckedUpdateInput = {};

    if (body.title !== undefined) {
      updateData.title = body.title;
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }
    if (body.status !== undefined) {
      updateData.status = body.status;
    }
    if (body.priority !== undefined) {
      updateData.priority = body.priority;
    }
    if (body.assigneeId !== undefined) {
      updateData.assigneeId = body.assigneeId;
    }
    if (body.dueDate !== undefined) {
      updateData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.sortOrder !== undefined) {
      updateData.sortOrder = new Prisma.Decimal(body.sortOrder);
    }

    const updated = await app.prisma.task.update({
      where: { id: params.taskId },
      data: updateData,
      select: {
        id: true,
        projectId: true,
        creatorId: true,
        assigneeId: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        sortOrder: true,
        dueDate: true,
        createdAt: true,
        updatedAt: true,
        checklistItems: {
          select: {
            id: true,
            completedAt: true
          }
        }
      }
    });

    return { data: serializeTask(updated) };
  });

  app.post('/projects/:projectId/tasks/reorder', async (request) => {
    const userId = await requireUserId(request);
    const params = projectParamsSchema.pick({ projectId: true }).parse(request.params);
    const body = reorderTasksBodySchema.parse(request.body);

    await ensureProjectAccess(app, params.projectId, userId);

    const seenStatuses = new Set<TaskStatus>();
    body.columns.forEach((column) => {
      if (seenStatuses.has(column.status)) {
        throw app.httpErrors.badRequest('Duplicate column statuses provided');
      }
      seenStatuses.add(column.status);
    });

    const seenTaskIds = new Set<string>();
    body.columns.forEach((column) => {
      column.taskIds.forEach((taskId) => {
        if (seenTaskIds.has(taskId)) {
          throw app.httpErrors.badRequest('Task ids must be unique across columns');
        }
        seenTaskIds.add(taskId);
      });
    });

    const referencedTaskIds = Array.from(seenTaskIds);

    if (referencedTaskIds.length > 0) {
      const tasks = await app.prisma.task.findMany({
        where: {
          projectId: params.projectId,
          id: {
            in: referencedTaskIds
          }
        },
        select: {
          id: true
        }
      });

      if (tasks.length !== referencedTaskIds.length) {
        throw app.httpErrors.badRequest('One or more tasks do not belong to the project');
      }
    }

    let order = 1;
    const updates: Prisma.PrismaPromise<unknown>[] = [];

    for (const status of boardStatuses) {
      const column = body.columns.find((item) => item.status === status);
      if (!column) {
        continue;
      }

      column.taskIds.forEach((taskId) => {
        const sortOrder = new Prisma.Decimal(order);
        updates.push(
          app.prisma.task.updateMany({
            where: {
              id: taskId,
              projectId: params.projectId
            },
            data: {
              status,
              sortOrder
            }
          })
        );
        order += 1;
      });
    }

    if (updates.length > 0) {
      await app.prisma.$transaction(updates);
    }

    return { data: { taskIds: referencedTaskIds } };
  });

  app.delete('/tasks/:taskId', async (request, reply) => {
    const userId = await requireUserId(request);
    const params = taskParamsSchema.parse(request.params);

    const task = await app.prisma.task.findUnique({
      where: { id: params.taskId },
      select: {
        id: true,
        projectId: true
      }
    });

    if (!task) {
      throw app.httpErrors.notFound('Task not found');
    }

    await ensureProjectAccess(app, task.projectId, userId);

    await app.prisma.$transaction([
      app.prisma.taskChecklistItem.deleteMany({
        where: { taskId: params.taskId }
      }),
      app.prisma.comment.deleteMany({
        where: { taskId: params.taskId }
      }),
      app.prisma.attachment.deleteMany({
        where: { taskId: params.taskId }
      }),
      app.prisma.task.delete({
        where: { id: params.taskId }
      })
    ]);

    reply.code(204);
    return null;
  });
};
