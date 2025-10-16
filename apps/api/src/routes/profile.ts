import type { FastifyInstance } from 'fastify';
import type { NotificationPreference } from '@taskflow/types';
import { updateProfileBodySchema } from '@taskflow/types';
import { requireUserId } from '../utils/current-user.js';
import { mergePreferencePatch, toNotificationPreferences } from '../utils/notification-preferences.js';
import { serializeUser } from '../utils/serialize-user.js';

const buildPreferenceUpdate = (
  patch: Partial<NotificationPreference>
): { update: Record<string, boolean | undefined>; create: NotificationPreference } => {
  const create = mergePreferencePatch(patch);
  return {
    update: {
      emailMentions: patch.emailMentions,
      emailTaskUpdates: patch.emailTaskUpdates,
      inAppMentions: patch.inAppMentions,
      inAppTaskUpdates: patch.inAppTaskUpdates
    },
    create
  };
};

type ProfileRouteUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  timezone: string | null;
  createdAt: Date;
  updatedAt: Date;
  notificationPreference: NotificationPreference | null;
};

const ensurePreference = async (app: FastifyInstance, user: ProfileRouteUser): Promise<NotificationPreference> => {
  if (user.notificationPreference) {
    return user.notificationPreference;
  }

  const created = await app.prisma.notificationPreference.create({
    data: {
      userId: user.id
    }
  });

  return {
    emailMentions: created.emailMentions,
    emailTaskUpdates: created.emailTaskUpdates,
    inAppMentions: created.inAppMentions,
    inAppTaskUpdates: created.inAppTaskUpdates
  };
};

export const registerProfileRoutes = async (app: FastifyInstance): Promise<void> => {
  app.get('/auth/me', async (request) => {
    const userId = await requireUserId(request);

    const user = await app.prisma.user.findUnique({
      where: { id: userId },
      include: {
        notificationPreference: true
      }
    });

    if (!user) {
      throw app.httpErrors.notFound('User not found');
    }

  const preference = await ensurePreference(app, user as ProfileRouteUser);

    return {
      user: serializeUser(user, preference)
    };
  });

  app.patch('/auth/me', async (request) => {
    const userId = await requireUserId(request);
    const body = updateProfileBodySchema.parse(request.body ?? {});

    const preferenceOperations = body.notificationPreferences
      ? buildPreferenceUpdate(body.notificationPreferences)
      : null;

    const user = await app.prisma.user.update({
      where: { id: userId },
      data: {
        name: body.name ?? undefined,
        timezone: body.timezone ?? undefined,
        avatarUrl: body.avatarUrl ?? undefined,
        notificationPreference: preferenceOperations
          ? {
              upsert: {
                update: preferenceOperations.update,
                create: preferenceOperations.create
              }
            }
          : undefined
      },
      include: {
        notificationPreference: true
      }
    });

    const preference = toNotificationPreferences(user.notificationPreference);

    return {
      user: serializeUser(user, preference)
    };
  });
};
