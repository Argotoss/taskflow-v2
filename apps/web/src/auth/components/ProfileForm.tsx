import { useEffect, useMemo, useState } from 'react';
import type { JSX, FormEvent } from 'react';
import type { UpdateProfileBody } from '@taskflow/types';
import type { StoredSession } from '../AuthContext.js';

/* eslint-disable @typescript-eslint/no-unused-vars, no-unused-vars */
interface ProfileFormProps {
  user: StoredSession['user'];
  submitting: boolean;
  onSubmit: (changes: UpdateProfileBody) => Promise<void>;
}
/* eslint-enable @typescript-eslint/no-unused-vars, no-unused-vars */

interface FormState {
  name: string;
  timezone: string;
  avatarUrl: string;
  emailMentions: boolean;
  emailTaskUpdates: boolean;
  inAppMentions: boolean;
  inAppTaskUpdates: boolean;
}

const toFormState = (user: StoredSession['user']): FormState => ({
  name: user.name,
  timezone: user.timezone ?? '',
  avatarUrl: user.avatarUrl ?? '',
  emailMentions: user.notificationPreferences.emailMentions,
  emailTaskUpdates: user.notificationPreferences.emailTaskUpdates,
  inAppMentions: user.notificationPreferences.inAppMentions,
  inAppTaskUpdates: user.notificationPreferences.inAppTaskUpdates
});

const ProfileForm = ({ user, submitting, onSubmit }: ProfileFormProps): JSX.Element => {
  const [form, setForm] = useState<FormState>(() => toFormState(user));

  useEffect(() => {
    setForm(toFormState(user));
  }, [user]);

  const payload = useMemo<UpdateProfileBody>(() => {
    const trimmedName = form.name.trim();
    const trimmedTimezone = form.timezone.trim();
    const trimmedAvatar = form.avatarUrl.trim();

    const changes: UpdateProfileBody = {};

    if (trimmedName && trimmedName !== user.name) {
      changes.name = trimmedName;
    }

    if (trimmedTimezone !== (user.timezone ?? '')) {
      changes.timezone = trimmedTimezone.length === 0 ? null : trimmedTimezone;
    }

    if (trimmedAvatar !== (user.avatarUrl ?? '')) {
      changes.avatarUrl = trimmedAvatar.length === 0 ? null : trimmedAvatar;
    }

    const notificationsChanged =
      form.emailMentions !== user.notificationPreferences.emailMentions ||
      form.emailTaskUpdates !== user.notificationPreferences.emailTaskUpdates ||
      form.inAppMentions !== user.notificationPreferences.inAppMentions ||
      form.inAppTaskUpdates !== user.notificationPreferences.inAppTaskUpdates;

    if (notificationsChanged) {
      changes.notificationPreferences = {
        emailMentions: form.emailMentions,
        emailTaskUpdates: form.emailTaskUpdates,
        inAppMentions: form.inAppMentions,
        inAppTaskUpdates: form.inAppTaskUpdates
      };
    }

    return changes;
  }, [form, user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await onSubmit(payload);
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="auth-form__field">
        <span>Name</span>
        <input
          type="text"
          value={form.name}
          onChange={(event) => setForm((state) => ({ ...state, name: event.currentTarget.value }))}
          required
        />
      </label>
      <label className="auth-form__field">
        <span>Timezone</span>
        <input
          type="text"
          placeholder="e.g. America/New_York"
          value={form.timezone}
          onChange={(event) => setForm((state) => ({ ...state, timezone: event.currentTarget.value }))}
        />
      </label>
      <label className="auth-form__field">
        <span>Avatar URL</span>
        <input
          type="url"
          placeholder="https://..."
          value={form.avatarUrl}
          onChange={(event) => setForm((state) => ({ ...state, avatarUrl: event.currentTarget.value }))}
        />
      </label>

      <fieldset className="auth-form__field">
        <legend>Notification Preferences</legend>
        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            checked={form.emailMentions}
            onChange={(event) => setForm((state) => ({ ...state, emailMentions: event.currentTarget.checked }))}
          />
          Email mentions
        </label>
        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            checked={form.emailTaskUpdates}
            onChange={(event) => setForm((state) => ({ ...state, emailTaskUpdates: event.currentTarget.checked }))}
          />
          Email task updates
        </label>
        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            checked={form.inAppMentions}
            onChange={(event) => setForm((state) => ({ ...state, inAppMentions: event.currentTarget.checked }))}
          />
          In-app mentions
        </label>
        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            checked={form.inAppTaskUpdates}
            onChange={(event) => setForm((state) => ({ ...state, inAppTaskUpdates: event.currentTarget.checked }))}
          />
          In-app task updates
        </label>
      </fieldset>

      <div className="auth-form__actions">
        <button className="workspace-button workspace-button--primary" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
};

export default ProfileForm;
