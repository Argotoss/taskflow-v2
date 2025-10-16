import type { NotificationPreference } from '@taskflow/types';

export const defaultNotificationPreferences: NotificationPreference = {
  emailMentions: true,
  emailTaskUpdates: true,
  inAppMentions: true,
  inAppTaskUpdates: true
};

export const toNotificationPreferences = (
  preference?: {
    emailMentions: boolean;
    emailTaskUpdates: boolean;
    inAppMentions: boolean;
    inAppTaskUpdates: boolean;
  } | null
): NotificationPreference => {
  if (!preference) {
    return defaultNotificationPreferences;
  }

  return {
    emailMentions: preference.emailMentions,
    emailTaskUpdates: preference.emailTaskUpdates,
    inAppMentions: preference.inAppMentions,
    inAppTaskUpdates: preference.inAppTaskUpdates
  };
};

export const mergePreferencePatch = (
  patch: Partial<NotificationPreference>
): NotificationPreference => ({
  ...defaultNotificationPreferences,
  ...patch
});
