import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent, JSX } from 'react';
import type { UpdateProfileBody } from '@taskflow/types';
import type { StoredSession } from '../AuthContext.js';

type ProfileFormProps = {
  user: StoredSession['user'];
  onSubmit: (_changes: UpdateProfileBody) => Promise<void>;
  formId?: string;
  submitting?: boolean;
};

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

const ProfileForm = ({ user, onSubmit, formId, submitting }: ProfileFormProps): JSX.Element => {
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

  const handleTextChange =
    (field: keyof Pick<FormState, 'name' | 'timezone' | 'avatarUrl'>) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const { value } = event.currentTarget;
      setForm((state) => ({ ...state, [field]: value }));
    };

  const handleCheckboxChange =
    (field: keyof Pick<FormState, 'emailMentions' | 'emailTaskUpdates' | 'inAppMentions' | 'inAppTaskUpdates'>) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const { checked } = event.currentTarget;
      setForm((state) => ({ ...state, [field]: checked }));
    };

  return (
    <form id={formId} className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
      <label className="auth-form__field">
        <span>Name</span>
        <input
          type="text"
          value={form.name}
          onChange={handleTextChange('name')}
          disabled={submitting}
          required
        />
      </label>
      <label className="auth-form__field">
        <span>Timezone</span>
        <input type="text" value={form.timezone} onChange={handleTextChange('timezone')} disabled={submitting} />
      </label>
      <label className="auth-form__field">
        <span>Avatar URL</span>
        <input type="url" value={form.avatarUrl} onChange={handleTextChange('avatarUrl')} disabled={submitting} />
      </label>

      <fieldset className="auth-form__field" disabled={submitting}>
        <legend>Notification Preferences</legend>
        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            checked={form.emailMentions}
            onChange={handleCheckboxChange('emailMentions')}
          />
          Email mentions
        </label>
        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            checked={form.emailTaskUpdates}
            onChange={handleCheckboxChange('emailTaskUpdates')}
          />
          Email task updates
        </label>
        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            checked={form.inAppMentions}
            onChange={handleCheckboxChange('inAppMentions')}
          />
          In-app mentions
        </label>
        <label className="auth-form__checkbox">
          <input
            type="checkbox"
            checked={form.inAppTaskUpdates}
            onChange={handleCheckboxChange('inAppTaskUpdates')}
          />
          In-app task updates
        </label>
      </fieldset>

    </form>
  );
};

export default ProfileForm;
