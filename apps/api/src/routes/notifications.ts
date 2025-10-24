import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@taskflow/db';
import { z } from 'zod';
import type { NotificationSummary } from '@taskflow/types';
import {
  listNotificationsResponseSchema,
  notificationListQuerySchema,
  markNotificationReadResponseSchema,
  notificationSummarySchema,
  uuidSchema
} from '@taskflow/types';
import { requireUserId } from '../utils/current-user.js';

type NotificationRecord = Prisma.NotificationGetPayload<{
  select: {
    id: true;
    userId: true;
    type: true;
    payload: true;
    readAt: true;
    createdAt: true;
  };
}>;

const serializeNotification = (notification: NotificationRecord): NotificationSummary =>
  notificationSummarySchema.parse({
    id: notification.id,
    userId: notification.userId,
    type: notification.type,
    payload: notification.payload,
    readAt: notification.readAt ? notification.readAt.toISOString() : null,
    createdAt: notification.createdAt.toISOString()
  });

const notificationParamsSchema = z.object({
  notificationId: uuidSchema
});

export const registerNotificationRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/notifications', async (request) => {
    const userId = await requireUserId(request);
    const query = notificationListQuerySchema.parse(request.query ?? {});

    const skip = (query.page - 1) * query.pageSize;
    const where = {
      userId,
      readAt: query.unreadOnly ? null : undefined
    } as const;

    const [notifications, total] = await Promise.all([
      app.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.pageSize,
        select: {
          id: true,
          userId: true,
          type: true,
          payload: true,
          readAt: true,
          createdAt: true
        }
      }),
      app.prisma.notification.count({ where })
    ]);

    const data = notifications.map((notification) =>
      serializeNotification(notification as NotificationRecord)
    );

    return listNotificationsResponseSchema.parse({
      data,
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: total,
        totalPages: Math.ceil(total / query.pageSize)
      }
    });
  });

  app.post('/notifications/:notificationId/read', async (request) => {
    const userId = await requireUserId(request);
    const params = notificationParamsSchema.parse(request.params);

    const notification = await app.prisma.notification.findUnique({
      where: { id: params.notificationId },
      select: {
        id: true,
        userId: true,
        type: true,
        payload: true,
        readAt: true,
        createdAt: true
      }
    });

    if (!notification || notification.userId !== userId) {
      throw app.httpErrors.notFound('Notification not found');
    }

    if (notification.readAt) {
      return markNotificationReadResponseSchema.parse({
        data: serializeNotification(notification as NotificationRecord)
      });
    }

    const updated = await app.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: new Date() },
      select: {
        id: true,
        userId: true,
        type: true,
        payload: true,
        readAt: true,
        createdAt: true
      }
    });

    return markNotificationReadResponseSchema.parse({
      data: serializeNotification(updated as NotificationRecord)
    });
  });
};
