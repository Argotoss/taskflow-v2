import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  attachmentSummarySchema,
  createAttachmentBodySchema,
  presignUploadResponseSchema,
  taskParamsSchema,
  type AttachmentSummary
} from '@taskflow/types';
import { requireUserId } from '../utils/current-user.js';
import { environment } from '../config/environment.js';
import type { Prisma } from '@taskflow/db';

type AttachmentRecord = Prisma.AttachmentGetPayload<{
  include: {
    uploader: {
      select: {
        id: true;
        email: true;
        name: true;
        avatarUrl: true;
      };
    };
  };
}>;

const serializeAttachment = (attachment: AttachmentRecord): AttachmentSummary =>
  attachmentSummarySchema.parse({
    id: attachment.id,
    taskId: attachment.taskId,
    uploaderId: attachment.uploaderId,
    fileName: attachment.fileName,
    fileSize: attachment.fileSize,
    contentType: attachment.contentType,
    downloadUrl: `https://${environment.ATTACHMENTS_BUCKET}.s3.${environment.AWS_REGION}.amazonaws.com/${attachment.storageKey}`,
    createdAt: attachment.createdAt.toISOString(),
    uploader: attachment.uploader
  });

const fetchTaskWorkspace = async (
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

export const registerAttachmentRoutes = async (app: FastifyInstance): Promise<void> => {
  const taskParamSchema = taskParamsSchema.pick({ taskId: true });

  app.post('/tasks/:taskId/attachments/presign', async (request) => {
    const userId = await requireUserId(request);
    const params = taskParamSchema.parse(request.params);
    const body = createAttachmentBodySchema.parse(request.body);

    const task = await fetchTaskWorkspace(app, params.taskId);
    const membership = await app.prisma.membership.findFirst({
      where: {
        workspaceId: task.project.workspaceId,
        userId
      }
    });

    if (!membership) {
      throw app.httpErrors.forbidden('Insufficient permissions for task');
    }

    const storageKey = `attachments/${params.taskId}/${crypto.randomUUID()}-${body.fileName}`;
    const uploadUrl = `https://${environment.ATTACHMENTS_BUCKET}.s3.${environment.AWS_REGION}.amazonaws.com/${storageKey}`;

    return presignUploadResponseSchema.parse({
      uploadUrl,
      storageKey
    });
  });

  const createAttachmentRecordSchema = createAttachmentBodySchema.extend({
    storageKey: (presignUploadResponseSchema.shape.storageKey as typeof presignUploadResponseSchema.shape.storageKey)
  });

  app.post('/tasks/:taskId/attachments', async (request, reply) => {
    const userId = await requireUserId(request);
    const params = taskParamSchema.parse(request.params);
    const body = createAttachmentRecordSchema.parse(request.body);

    const task = await fetchTaskWorkspace(app, params.taskId);
    const membership = await app.prisma.membership.findFirst({
      where: {
        workspaceId: task.project.workspaceId,
        userId
      }
    });

    if (!membership) {
      throw app.httpErrors.forbidden('Insufficient permissions for task');
    }

    const attachment = await app.prisma.attachment.create({
      data: {
        taskId: params.taskId,
        uploaderId: userId,
        fileName: body.fileName,
        fileSize: body.fileSize,
        contentType: body.contentType,
        storageKey: body.storageKey
      },
      include: {
        uploader: {
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
    return { data: serializeAttachment(attachment) };
  });

  app.get('/tasks/:taskId/attachments', async (request) => {
    const userId = await requireUserId(request);
    const params = taskParamSchema.parse(request.params);

    const task = await fetchTaskWorkspace(app, params.taskId);
    const membership = await app.prisma.membership.findFirst({
      where: {
        workspaceId: task.project.workspaceId,
        userId
      }
    });

    if (!membership) {
      throw app.httpErrors.forbidden('Insufficient permissions for task');
    }

    const attachments = await app.prisma.attachment.findMany({
      where: { taskId: params.taskId },
      include: {
        uploader: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true
          }
        }
      }
    });

    return {
      data: attachments.map(serializeAttachment)
    };
  });
};
