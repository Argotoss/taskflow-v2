import type { FastifyInstance } from 'fastify';
import { Prisma } from '@taskflow/db';
import type { TaskChecklistItem } from '@taskflow/types';
import {
  createTaskChecklistItemBodySchema,
  listTaskChecklistResponseSchema,
  taskChecklistCollectionParamsSchema,
  taskChecklistItemParamsSchema,
  taskChecklistItemSchema,
  updateTaskChecklistItemBodySchema
} from '@taskflow/types';
import { requireUserId } from '../utils/current-user.js';
import { ensureProjectAccess } from '../utils/project-access.js';

const serializeChecklistItem = (
  item: Prisma.TaskChecklistItemGetPayload<{ select: { id: true; taskId: true; label: true; position: true; completedAt: true; createdAt: true; updatedAt: true } }>
): TaskChecklistItem =>
  taskChecklistItemSchema.parse({
    id: item.id,
    taskId: item.taskId,
    label: item.label,
    position: Number(item.position),
    completedAt: item.completedAt ? item.completedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  });

const loadTaskForUser = async (
  app: FastifyInstance,
  taskId: string,
  userId: string
): Promise<{ id: string; projectId: string }> => {
  const task = await app.prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      projectId: true
    }
  });

  if (!task) {
    throw app.httpErrors.notFound('Task not found');
  }

  await ensureProjectAccess(app, task.projectId, userId);
  return task;
};

export const registerTaskChecklistRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/tasks/:taskId/checklist', async (request) => {
    const userId = await requireUserId(request);
    const params = taskChecklistCollectionParamsSchema.parse(request.params);

    const task = await loadTaskForUser(app, params.taskId, userId);
    const items = await app.prisma.taskChecklistItem.findMany({
      where: { taskId: task.id },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        taskId: true,
        label: true,
        position: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return listTaskChecklistResponseSchema.parse({
      data: items.map((item) => serializeChecklistItem(item))
    });
  });

  app.post('/tasks/:taskId/checklist', async (request, reply) => {
    const userId = await requireUserId(request);
    const params = taskChecklistCollectionParamsSchema.parse(request.params);
    const body = createTaskChecklistItemBodySchema.parse(request.body);

    const task = await loadTaskForUser(app, params.taskId, userId);

    const aggregate = await app.prisma.taskChecklistItem.aggregate({
      where: { taskId: task.id },
      _max: { position: true }
    });

    const nextPosition = new Prisma.Decimal((aggregate._max.position?.toNumber() ?? 0) + 1);

    const created = await app.prisma.taskChecklistItem.create({
      data: {
        taskId: task.id,
        label: body.label.trim(),
        position: nextPosition
      },
      select: {
        id: true,
        taskId: true,
        label: true,
        position: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    reply.code(201);
    return { data: serializeChecklistItem(created) };
  });

  app.patch('/tasks/:taskId/checklist/:itemId', async (request) => {
    const userId = await requireUserId(request);
    const params = taskChecklistItemParamsSchema.parse(request.params);
    const body = updateTaskChecklistItemBodySchema.parse(request.body ?? {});

    const task = await loadTaskForUser(app, params.taskId, userId);

    const existing = await app.prisma.taskChecklistItem.findUnique({
      where: { id: params.itemId },
      select: {
        id: true,
        taskId: true
      }
    });

    if (!existing || existing.taskId !== task.id) {
      throw app.httpErrors.notFound('Checklist item not found');
    }

    const updateData: Prisma.TaskChecklistItemUncheckedUpdateInput = {};

    if (body.label !== undefined) {
      updateData.label = body.label.trim();
    }

    if (body.completed !== undefined) {
      updateData.completedAt = body.completed ? new Date() : null;
    }

    const updated = await app.prisma.taskChecklistItem.update({
      where: { id: params.itemId },
      data: updateData,
      select: {
        id: true,
        taskId: true,
        label: true,
        position: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    return { data: serializeChecklistItem(updated) };
  });

  app.delete('/tasks/:taskId/checklist/:itemId', async (request, reply) => {
    const userId = await requireUserId(request);
    const params = taskChecklistItemParamsSchema.parse(request.params);

    const task = await loadTaskForUser(app, params.taskId, userId);

    const existing = await app.prisma.taskChecklistItem.findUnique({
      where: { id: params.itemId },
      select: { id: true, taskId: true }
    });

    if (!existing || existing.taskId !== task.id) {
      throw app.httpErrors.notFound('Checklist item not found');
    }

    await app.prisma.taskChecklistItem.delete({
      where: { id: params.itemId }
    });

    reply.code(204);
    return null;
  });
};
