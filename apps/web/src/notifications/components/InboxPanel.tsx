import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch } from 'react';
import type { JSX } from 'react';
import type { NotificationSummary, AuthInviteSummary } from '@taskflow/types';
import { notificationsApi } from '../notificationsApi.js';
import { authApi, ApiError } from '../../auth/authApi.js';
import { useAuth } from '../../auth/useAuth.js';

type OnboardingAction = 'PROFILE' | 'PROJECT' | 'INVITE' | 'TASK';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action: OnboardingAction;
}

type InboxCounts = { unreadNotifications: number; pendingInvites: number };

interface InboxPanelProps {
  accessToken: string | null;
  steps: OnboardingStep[];
  onCountsChange: Dispatch<InboxCounts>;
  onRequestSettings: () => void;
  onRequestNewTask: () => void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const InboxPanel = ({ accessToken, steps, onCountsChange, onRequestSettings, onRequestNewTask }: InboxPanelProps): JSX.Element => {
  const auth = useAuth();
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState('');
  const [invites, setInvites] = useState<AuthInviteSummary[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [processingInvite, setProcessingInvite] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(
    async (token: string | null) => {
      if (!token) {
        setNotifications([]);
        setNotificationsError('');
        return;
      }
      setNotificationsLoading(true);
      setNotificationsError('');
      try {
        const data = await notificationsApi.list(token, { pageSize: 50 });
        setNotifications(data);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Unable to load notifications';
        setNotificationsError(message);
        setNotifications([]);
      } finally {
        setNotificationsLoading(false);
      }
    },
    []
  );

  const loadInvites = useCallback(
    async (token: string | null) => {
      if (!token) {
        setInvites([]);
        setInviteError('');
        return;
      }
      setInvitesLoading(true);
      setInviteError('');
      try {
        const data = await authApi.listInvites(token);
        setInvites(data);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Unable to load invites';
        setInviteError(message);
        setInvites([]);
      } finally {
        setInvitesLoading(false);
      }
    },
    []
  );

  const refreshInbox = useCallback(
    async (token: string | null) => {
      setRefreshing(true);
      await Promise.all([loadNotifications(token), loadInvites(token)]);
      setRefreshing(false);
    },
    [loadInvites, loadNotifications]
  );

  useEffect(() => {
    void refreshInbox(accessToken);
  }, [accessToken, refreshInbox]);

  useEffect(() => {
    const unread = notifications.filter((notification) => notification.readAt === null).length;
    const pendingInvites = invites.length;
    onCountsChange({ unreadNotifications: unread, pendingInvites });
  }, [invites, notifications, onCountsChange]);

  const handleMarkRead = useCallback(
    async (notificationId: string) => {
      if (!accessToken) {
        return;
      }
      try {
        const updated = await notificationsApi.markRead(accessToken, notificationId);
        setNotifications((current) => current.map((entry) => (entry.id === notificationId ? updated : entry)));
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Unable to update notification';
        setNotificationsError(message);
      }
    },
    [accessToken]
  );

  const handleInviteAccept = useCallback(
    async (token: string) => {
      setInviteError('');
      setProcessingInvite(token);
      try {
        await auth.acceptInvite({ token });
        setInvites((current) => current.filter((entry) => entry.token !== token));
        const nextToken = auth.session?.tokens.accessToken ?? accessToken;
        await refreshInbox(nextToken ?? null);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'Unable to join workspace';
        setInviteError(message);
      } finally {
        setProcessingInvite('');
      }
    },
    [accessToken, auth, refreshInbox]
  );

  const handleInviteDismiss = useCallback((token: string) => {
    setInvites((current) => current.filter((entry) => entry.token !== token));
  }, []);

  const onboardingCompleted = useMemo(() => {
    const total = steps.length;
    const done = steps.filter((step) => step.completed).length;
    return { done, total };
  }, [steps]);

  const resolveNotificationTitle = (notification: NotificationSummary): string => {
    if (isRecord(notification.payload) && typeof notification.payload.title === 'string') {
      return notification.payload.title;
    }
    if (notification.type === 'WORKSPACE_JOINED' && isRecord(notification.payload) && typeof notification.payload.workspaceName === 'string') {
      return `Joined ${notification.payload.workspaceName}`;
    }
    if (notification.type === 'ONBOARDING_WELCOME') {
      return 'Welcome to Taskflow';
    }
    return 'Notification';
  };

  const resolveNotificationBody = (notification: NotificationSummary): string => {
    if (isRecord(notification.payload) && typeof notification.payload.description === 'string') {
      return notification.payload.description;
    }
    if (notification.type === 'ONBOARDING_WELCOME') {
      return 'Create a workspace to invite teammates and start planning.';
    }
    if (notification.type === 'WORKSPACE_JOINED' && isRecord(notification.payload) && typeof notification.payload.workspaceName === 'string') {
      return `You have access to ${notification.payload.workspaceName}.`;
    }
    return '';
  };

  const renderStepAction = (action: OnboardingAction, completed: boolean): (() => void) | undefined => {
    if (completed) {
      return undefined;
    }
    if (action === 'PROFILE' || action === 'INVITE' || action === 'PROJECT') {
      return onRequestSettings;
    }
    if (action === 'TASK') {
      return onRequestNewTask;
    }
    return undefined;
  };

  return (
    <div className="inbox">
      <header className="inbox__header">
        <p>Keep track of invites, updates, and onboarding steps.</p>
        <button type="button" className="inbox__refresh" onClick={() => void refreshInbox(accessToken)} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      <section className="inbox__section">
        <div className="inbox__section-header">
          <h3>Getting started</h3>
          <span className="inbox__badge">
            {onboardingCompleted.done}/{onboardingCompleted.total}
          </span>
        </div>
        <ul className="inbox__list">
          {steps.map((step) => {
            const action = renderStepAction(step.action, step.completed);
            return (
              <li key={step.id} className={`inbox__item${step.completed ? ' inbox__item--done' : ''}`}>
                <div className="inbox__item-content">
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </div>
                {step.completed ? (
                  <span className="inbox__status">Completed</span>
                ) : action ? (
                  <button type="button" className="inbox__action" onClick={action}>
                    Start
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="inbox__section">
        <div className="inbox__section-header">
          <h3>Workspace invites</h3>
          <span className="inbox__badge">{invites.length}</span>
        </div>
        {inviteError && <div className="inbox__error">{inviteError}</div>}
        {invitesLoading ? (
          <p className="inbox__hint">Loading invites…</p>
        ) : invites.length === 0 ? (
          <p className="inbox__hint">No pending invites.</p>
        ) : (
          <ul className="inbox__list">
            {invites.map((invite) => (
              <li key={invite.token} className="inbox__item">
                <div className="inbox__item-content">
                  <strong>{invite.workspaceName}</strong>
                  <span>Role: {invite.role}</span>
                  <span>Expires: {new Date(invite.expiresAt).toLocaleString()}</span>
                </div>
                <div className="inbox__actions">
                  <button
                    type="button"
                    className="inbox__action"
                    onClick={() => {
                      void handleInviteAccept(invite.token);
                    }}
                    disabled={processingInvite === invite.token}
                  >
                    {processingInvite === invite.token ? 'Joining…' : 'Join'}
                  </button>
                  <button type="button" className="inbox__action inbox__action--ghost" onClick={() => handleInviteDismiss(invite.token)}>
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="inbox__section">
        <div className="inbox__section-header">
          <h3>Notifications</h3>
          <span className="inbox__badge">
            {notifications.filter((notification) => notification.readAt === null).length}
          </span>
        </div>
        {notificationsError && <div className="inbox__error">{notificationsError}</div>}
        {notificationsLoading ? (
          <p className="inbox__hint">Loading notifications…</p>
        ) : notifications.length === 0 ? (
          <p className="inbox__hint">No updates yet.</p>
        ) : (
          <ul className="inbox__list">
            {notifications.map((notification) => (
              <li
                key={notification.id}
                className={`inbox__item${notification.readAt ? '' : ' inbox__item--unread'}`}
              >
                <div className="inbox__item-content">
                  <strong>{resolveNotificationTitle(notification)}</strong>
                  {resolveNotificationBody(notification) ? <span>{resolveNotificationBody(notification)}</span> : null}
                  <span className="inbox__meta">{new Date(notification.createdAt).toLocaleString()}</span>
                </div>
                {notification.readAt ? (
                  <span className="inbox__status">Read</span>
                ) : (
                  <button
                    type="button"
                    className="inbox__action"
                    onClick={() => {
                      void handleMarkRead(notification.id);
                    }}
                  >
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default InboxPanel;
