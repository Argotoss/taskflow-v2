import type { FastifyInstance } from 'fastify';
import {
  commentListQuerySchema,
  commentSummarySchema,
  createCommentBodySchema,
  listCommentsResponseSchema,
  taskParamsSchema,
  type CommentSummary
} from '@taskflow/types';
import { requireUserId } from '../utils/current-user.js';

const serializeComment = (comment: {
  id: string;
  taskId: string;
  authorId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    id: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  };
}): CommentSummary =>
  commentSummarySchema.parse({
    id: comment.id,
    taskId: comment.taskId,
    authorId: comment.authorId,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: comment.author
  });

const fetchTaskWithWorkspace = async (
  app: FastifyInstance,
  taskId: string
): Promise<{ id: string; project: { workspaceId: string } }> => {
  const task = await app.prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      project: {
        select: {
          workspaceId: true
        }
      }
    }
  });

  if (!task) {
    throw app.httpErrors.notFound('Task not found');
  }

  return task;
};

const assertWorkspaceAccess = async (
  app: FastifyInstance,
  workspaceId: string,
  userId: string
): Promise<void> => {
  const membership = await app.prisma.membership.findFirst({
    where: { workspaceId, userId }
  });

  if (!membership) {
    throw app.httpErrors.forbidden('Insufficient permissions for task');
  }
};

export const registerCommentRoutes = async (app: FastifyInstance): Promise<void> => {
  const taskParamSchema = taskParamsSchema.pick({ taskId: true });

  app.get('/tasks/:taskId/comments', async (request) => {
    const userId = requireUserId(request);
    const params = taskParamSchema.parse(request.params);
    const query = commentListQuerySchema.parse(request.query ?? {});

    const task = await fetchTaskWithWorkspace(app, params.taskId);
    await assertWorkspaceAccess(app, task.project.workspaceId, userId);

    const skip = (query.page - 1) * query.pageSize;

    const [comments, total] = await Promise.all([
      app.prisma.comment.findMany({
        where: { taskId: params.taskId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: query.pageSize,
        select: {
          id: true,
          taskId: true,
          authorId: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          author: {
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true
            }
          }
        }
      }),
      app.prisma.comment.count({ where: { taskId: params.taskId } })
    ]);

    return listCommentsResponseSchema.parse({
      data: comments.map(serializeComment),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize)
      }
    });
  });

  app.post('/tasks/:taskId/comments', async (request, reply) => {
    const userId = requireUserId(request);
    const params = taskParamSchema.parse(request.params);
    const body = createCommentBodySchema.parse(request.body);

    const task = await fetchTaskWithWorkspace(app, params.taskId);
    await assertWorkspaceAccess(app, task.project.workspaceId, userId);

    const comment = await app.prisma.comment.create({
      data: {
        taskId: params.taskId,
        authorId: userId,
        body: body.body
      },
      select: {
        id: true,
        taskId: true,
        authorId: true,
        body: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    reply.code(201);
    return { data: serializeComment(comment) };
  });
};
