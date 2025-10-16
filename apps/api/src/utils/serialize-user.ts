import type { NotificationPreference, UserDetail } from '@taskflow/types';
import { userDetailSchema } from '@taskflow/types';
import { toNotificationPreferences } from './notification-preferences.js';

interface SerializableUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null | undefined;
  timezone: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export const serializeUser = (
  user: SerializableUser,
  preference: NotificationPreference | null | undefined
): UserDetail =>
  userDetailSchema.parse({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    notificationPreferences: toNotificationPreferences(preference)
  });
