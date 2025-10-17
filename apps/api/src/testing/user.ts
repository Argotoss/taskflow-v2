import type { Prisma } from '@taskflow/db';

export type UserWithPreferences = Prisma.UserGetPayload<{ include: { notificationPreference: true } }>;
export type NotificationPreferenceRecord = NonNullable<UserWithPreferences['notificationPreference']>;

export const buildNotificationPreference = (
  overrides: Partial<NotificationPreferenceRecord> = {}
): NotificationPreferenceRecord => {
  const timestamp = new Date('2024-01-01T00:00:00.000Z');
  return {
    id: 'pref-00000000-0000-0000-0000-000000000000',
    userId: '00000000-0000-0000-0000-000000000000',
    emailMentions: true,
    emailTaskUpdates: true,
    inAppMentions: true,
    inAppTaskUpdates: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
};

export const buildUser = (overrides: Partial<UserWithPreferences> = {}): UserWithPreferences => {
  const timestamp = new Date('2024-01-01T00:00:00.000Z');
  const user: UserWithPreferences = {
    id: '00000000-0000-0000-0000-000000000000',
    email: 'user@taskflow.app',
    passwordHash: 'hash',
    name: 'Demo User',
    avatarUrl: null,
    timezone: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    notificationPreference: buildNotificationPreference(),
    ...overrides
  };

  if (Object.prototype.hasOwnProperty.call(overrides, 'notificationPreference')) {
    user.notificationPreference = overrides.notificationPreference ?? null;
  } else {
    user.notificationPreference = buildNotificationPreference({ userId: user.id });
  }

  return user;
};
