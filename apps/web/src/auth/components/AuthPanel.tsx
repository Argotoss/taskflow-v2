import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import type { UpdateProfileBody, InvitePreviewResponse, AuthInviteSummary } from '@taskflow/types';
import { useAuth } from '../useAuth.js';
import { authApi, ApiError } from '../authApi.js';
import WorkspaceAdminPanel from '../../workspaces/components/WorkspaceAdminPanel.js';
import ProfileForm from './ProfileForm.js';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset' | 'invite';

const resolveInitialMode = (): { mode: AuthMode; resetToken: string; inviteToken: string } => {
  if (typeof window === 'undefined') {
    return { mode: 'login', resetToken: '', inviteToken: '' };
  }

  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');
  if (typeof invite === 'string' && invite.length > 0) {
    return { mode: 'invite', resetToken: '', inviteToken: invite };
  }

  const token = params.get('token');
  if (typeof token === 'string' && token.length > 0) {
    return { mode: 'reset', resetToken: token, inviteToken: '' };
  }

  return { mode: 'login', resetToken: '', inviteToken: '' };
};

const modeLabels: Record<AuthMode, string> = {
  login: 'Sign in',
  register: 'Create account',
  forgot: 'Request reset link',
  reset: 'Choose new password',
  invite: 'Join workspace'
};

const inviteRoleLabels: Record<InvitePreviewResponse['role'], string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  CONTRIBUTOR: 'Contributor',
  VIEWER: 'Viewer'
};

interface AuthPanelProps {
  onCloseRequested?: () => void;
}

const AuthPanel = ({ onCloseRequested }: AuthPanelProps): JSX.Element => {
  const auth = useAuth();
  const initial = useMemo(resolveInitialMode, []);
  const [mode, setMode] = useState<AuthMode>(initial.mode);
  const [resetToken, setResetToken] = useState(initial.resetToken);
  const [inviteToken, setInviteToken] = useState(initial.inviteToken);
  const [invitePreview, setInvitePreview] = useState<InvitePreviewResponse | null>(null);
  const [inviteLoading, setInviteLoading] = useState(initial.mode === 'invite');
  const [inviteError, setInviteError] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetForm, setResetForm] = useState({ password: '', confirm: '' });
  const [inviteForm, setInviteForm] = useState({ name: '', password: '', confirm: '' });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showInvitePassword, setShowInvitePassword] = useState(false);
  const [showInviteConfirm, setShowInviteConfirm] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileStatus, setProfileStatus] = useState('');
  const [accountInvites, setAccountInvites] = useState<AuthInviteSummary[]>([]);
  const [accountInvitesLoading, setAccountInvitesLoading] = useState(false);
  const [accountInviteError, setAccountInviteError] = useState('');
  const [accountInviteStatus, setAccountInviteStatus] = useState('');
  const [processingInviteToken, setProcessingInviteToken] = useState<string | null>(null);

  const clearInviteTokenFromUrl = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    url.searchParams.delete('token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const clearInviteTokenState = useCallback(() => {
    setInviteToken('');
    setInvitePreview(null);
    setInviteError('');
    clearInviteTokenFromUrl();
    setMode((current) => (current === 'invite' ? 'login' : current));
  }, [clearInviteTokenFromUrl]);

  useEffect(() => {
    if (mode !== 'invite' || !inviteToken) {
      setInvitePreview(null);
      setInviteLoading(false);
      return;
    }
    let cancelled = false;
    setInviteLoading(true);
    setInviteError('');
    authApi
      .previewInvite(inviteToken)
      .then((response) => {
        if (!cancelled) {
          setInvitePreview(response);
          setInviteForm((current) => ({ ...current, name: response.invitedEmail.split('@')[0].replace(/\./g, ' ') }));
        }
      })
      .catch((exception) => {
        if (!cancelled) {
          const message = exception instanceof ApiError ? exception.message : 'Unable to load invite';
          setInviteError(message);
          setInvitePreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInviteLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [inviteToken, mode]);

  const clearFeedback = (): void => {
    setError('');
    setStatusMessage('');
    setInviteError('');
  };

  const switchMode = (nextMode: AuthMode): void => {
    setMode(nextMode);
    clearFeedback();
    if (nextMode !== 'reset') {
      setResetToken('');
    }
    if (nextMode !== 'invite') {
      setInviteToken('');
      setInvitePreview(null);
      setInviteForm({ name: '', password: '', confirm: '' });
      setShowInvitePassword(false);
      setShowInviteConfirm(false);
      clearInviteTokenFromUrl();
    }
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      await auth.login({ email: loginForm.email, password: loginForm.password });
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      await auth.register({ name: registerForm.name, email: registerForm.email, password: registerForm.password });
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : 'Unable to create account');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    clearFeedback();
    setLoading(true);
    try {
      await auth.requestPasswordReset(forgotEmail);
      setStatusMessage('If an account exists, we sent a reset link to your email.');
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : 'Unable to submit reset request');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    clearFeedback();

    if (resetForm.password !== resetForm.confirm) {
      setError('Passwords must match');
      return;
    }

    if (!resetToken) {
      setError('Reset token missing');
      return;
    }

    setLoading(true);
    try {
      await auth.resetPassword({ token: resetToken, password: resetForm.password });
      setStatusMessage('Password updated. You can sign in with the new password.');
      setResetForm({ password: '', confirm: '' });
      setResetToken('');
      setMode('login');
    } catch (exception) {
      setError(exception instanceof ApiError ? exception.message : 'Unable to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleInviteAccept = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    clearFeedback();
    setInviteError('');

    if (inviteForm.password !== inviteForm.confirm) {
      setInviteError('Passwords must match');
      return;
    }

    if (!inviteToken) {
      setInviteError('Invite token missing');
      return;
    }

    if (!inviteForm.name.trim()) {
      setInviteError('Name is required');
      return;
    }

    setLoading(true);
    try {
      await auth.acceptInvite({ token: inviteToken, name: inviteForm.name.trim(), password: inviteForm.password });
      setStatusMessage('Welcome aboard. You are now signed in.');
    } catch (exception) {
      setInviteError(exception instanceof ApiError ? exception.message : 'Unable to join workspace');
    } finally {
      setLoading(false);
    }
  };

  const loadAccountInvites = useCallback(async () => {
    if (!auth.user || !auth.session?.tokens.accessToken) {
      setAccountInvites([]);
      setAccountInviteError('');
      setAccountInviteStatus('');
      return;
    }
    setAccountInvitesLoading(true);
    setAccountInviteError('');
    try {
      const data = await authApi.listInvites(auth.session.tokens.accessToken);
      setAccountInvites(data);
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to load invites';
      setAccountInviteError(message);
      setAccountInvites([]);
    } finally {
      setAccountInvitesLoading(false);
    }
  }, [auth.session?.tokens.accessToken, auth.user?.id]);

  const handleAccountInviteAccept = useCallback(
    async (token: string) => {
      setAccountInviteError('');
      setAccountInviteStatus('');
      setProcessingInviteToken(token);
      const derivedName =
        accountInvites.find((entry) => entry.token === token)?.workspaceName ??
        (invitePreview && inviteToken === token ? invitePreview.workspaceName : '');
      try {
        await auth.acceptInvite({ token });
        setAccountInvites((current) => current.filter((entry) => entry.token !== token));
        if (derivedName) {
          setAccountInviteStatus(`Joined ${derivedName}`);
        } else {
          setAccountInviteStatus('Invite accepted');
        }
        if (inviteToken === token) {
          clearInviteTokenState();
        }
        await loadAccountInvites();
      } catch (exception) {
        const message = exception instanceof ApiError ? exception.message : 'Unable to join workspace';
        setAccountInviteError(message);
      } finally {
        setProcessingInviteToken(null);
      }
    },
    [accountInvites, auth, clearInviteTokenState, invitePreview, inviteToken, loadAccountInvites]
  );

  const handleAccountInviteDismiss = useCallback(
    (token: string) => {
      setAccountInvites((current) => current.filter((entry) => entry.token !== token));
      if (inviteToken === token) {
        clearInviteTokenState();
      }
    },
    [clearInviteTokenState, inviteToken]
  );

  useEffect(() => {
    if (!auth.user) {
      setAccountInvites([]);
      setAccountInviteStatus('');
      setAccountInviteError('');
      return;
    }
    void loadAccountInvites();
  }, [auth.user?.id, loadAccountInvites]);

  const handleProfileSubmit = async (changes: UpdateProfileBody): Promise<void> => {
    setProfileError('');
    setProfileStatus('');

    if (Object.keys(changes).length === 0) {
      setProfileStatus('No changes to save');
      return;
    }

    setProfileSaving(true);
    try {
      await auth.updateProfile(changes);
      setProfileStatus('Profile updated');
    } catch (exception) {
      setProfileError(exception instanceof ApiError ? exception.message : 'Unable to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setProfileError('');
    setProfileStatus('');
    await auth.logout();
  };

  const renderInviteTokenBanner = (): JSX.Element | null => {
    if (!auth.user || !inviteToken) {
      return null;
    }
    if (inviteLoading) {
      return <div className="auth-card__status">Validating invite…</div>;
    }
    if (inviteError) {
      return (
        <div className="auth-card__banner">
          <div className="auth-card__error">{inviteError}</div>
          <div className="auth-card__list-actions">
            <button type="button" className="workspace-button workspace-button--ghost" onClick={clearInviteTokenState}>
              Dismiss
            </button>
          </div>
        </div>
      );
    }
    if (!invitePreview) {
      return null;
    }
    const matchesAccount = invitePreview.invitedEmail.toLowerCase() === auth.user.email.toLowerCase();
    return (
      <div className="auth-card__banner">
        <p className="auth-card__subtitle">
          {invitePreview.invitedEmail} was invited to {invitePreview.workspaceName} as {inviteRoleLabels[invitePreview.role]}.
        </p>
        <div className="auth-card__list-actions">
          {matchesAccount ? (
            <>
              <button
                type="button"
                className="workspace-button"
                disabled={processingInviteToken === inviteToken}
                onClick={() => {
                  void handleAccountInviteAccept(inviteToken);
                }}
              >
                {processingInviteToken === inviteToken ? 'Joining…' : 'Join workspace'}
              </button>
              <button type="button" className="workspace-button workspace-button--ghost" onClick={clearInviteTokenState}>
                Dismiss
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="workspace-button"
                onClick={() => {
                  clearInviteTokenState();
                  void handleSignOut();
                }}
              >
                Sign out to continue
              </button>
              <button type="button" className="workspace-button workspace-button--ghost" onClick={clearInviteTokenState}>
                Dismiss
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  const renderAccountInvites = (): JSX.Element | null => {
    if (!auth.user) {
      return null;
    }
    if (accountInvitesLoading && accountInvites.length === 0) {
      return <p className="auth-card__subtitle">Checking for pending workspace invites…</p>;
    }
    if (accountInviteError && accountInvites.length === 0) {
      return <div className="auth-card__error">{accountInviteError}</div>;
    }
    if (accountInvites.length === 0) {
      return null;
    }
    return (
      <section className="auth-card__group">
        <h3>Pending workspace invites</h3>
        {accountInviteStatus && <div className="auth-card__status">{accountInviteStatus}</div>}
        {accountInviteError && <div className="auth-card__error">{accountInviteError}</div>}
        <ul className="auth-card__list">
          {accountInvites.map((invite) => (
            <li key={invite.token} className="auth-card__list-item">
              <div className="auth-card__list-details">
                <strong>{invite.workspaceName}</strong>
                <span className="auth-card__meta">Role: {inviteRoleLabels[invite.role]}</span>
                <span className="auth-card__meta">Expires: {new Date(invite.expiresAt).toLocaleString()}</span>
              </div>
              <div className="auth-card__list-actions">
                <button
                  type="button"
                  className="workspace-button"
                  disabled={processingInviteToken === invite.token}
                  onClick={() => {
                    void handleAccountInviteAccept(invite.token);
                  }}
                >
                  {processingInviteToken === invite.token ? 'Joining…' : 'Join'}
                </button>
                <button type="button" className="workspace-button workspace-button--ghost" onClick={() => handleAccountInviteDismiss(invite.token)}>
                  Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  if (!auth.ready) {
    return (
      <aside className="auth-card auth-card--centered">
        <div className="auth-card__spinner" aria-hidden="true" />
        <p>Preparing account settings…</p>
      </aside>
    );
  }

  const profileFormId = 'account-profile-form';

  if (auth.user) {
    return (
      <aside className="auth-card">
        <header className="auth-card__header">
          <div>
            <h2>Account</h2>
            <p className="auth-card__subtitle">Signed in as {auth.user.email}</p>
          </div>
          {onCloseRequested ? (
            <button type="button" className="auth-card__close" aria-label="Close" onClick={onCloseRequested}>
              ×
            </button>
          ) : null}
        </header>
        <section className="auth-card__group">
          <h3>Profile</h3>
          {profileError && <div className="auth-card__error">{profileError}</div>}
          {profileStatus && <div className="auth-card__status">{profileStatus}</div>}
          <ProfileForm user={auth.user} submitting={profileSaving} onSubmit={handleProfileSubmit} />
        </section>
        {renderInviteTokenBanner()}
        {renderAccountInvites()}
        <section className="auth-card__group">
          <h3>Workspaces</h3>
          <WorkspaceAdminPanel accessToken={auth.session?.tokens.accessToken ?? null} currentUserId={auth.user.id} />
        </section>
        <div className="auth-card__actions-row">
          <button
            className="workspace-button workspace-button--accent auth-card__save action-button-uniform"
            type="submit"
            form={profileFormId}
            disabled={profileSaving}
          >
            {profileSaving ? 'Saving…' : 'Save changes'}
          </button>
          <button
            className="workspace-button workspace-button--ghost auth-card__signout action-button-uniform"
            type="button"
            onClick={() => {
              clearFeedback();
              void handleSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="auth-card">
      <div className="auth-card__header">
        <h2>{modeLabels[mode]}</h2>
        <div className="auth-card__header-actions">
          {mode !== 'login' && (
            <button className="workspace-button workspace-button--ghost" type="button" onClick={() => switchMode('login')}>
              Sign in
            </button>
          )}
          {mode !== 'register' && (
            <button className="workspace-button workspace-button--ghost" type="button" onClick={() => switchMode('register')}>
              Create account
            </button>
          )}
          {mode !== 'forgot' && (
            <button className="workspace-button workspace-button--ghost" type="button" onClick={() => switchMode('forgot')}>
              Reset password
            </button>
          )}
        </div>
      </div>

      {mode !== 'invite' && error && <div className="auth-card__error">{error}</div>}
      {statusMessage && <div className="auth-card__status">{statusMessage}</div>}

      {mode === 'invite' && (
        <>
          {inviteLoading && <p className="auth-card__subtitle">Validating invite…</p>}
          {!inviteLoading && inviteError && <div className="auth-card__error">{inviteError}</div>}
          {!inviteLoading && !inviteError && invitePreview && (
            <>
              <p className="auth-card__subtitle">
                {invitePreview.invitedEmail} was invited to {invitePreview.workspaceName} as {inviteRoleLabels[invitePreview.role]}.
              </p>
              <form className="auth-form" onSubmit={handleInviteAccept}>
                <label className="auth-form__field">
                  <span>Full name</span>
                  <input
                    type="text"
                    value={inviteForm.name}
                    onChange={(event) => setInviteForm({ ...inviteForm, name: event.currentTarget.value })}
                    required
                  />
                </label>
                <label className="auth-form__field">
                  <span>Create password</span>
                  <div className="auth-form__password-wrapper">
                    <input
                      type={showInvitePassword ? 'text' : 'password'}
                      value={inviteForm.password}
                      onChange={(event) => setInviteForm({ ...inviteForm, password: event.currentTarget.value })}
                      required
                    />
                    <button
                      type="button"
                      className="auth-form__toggle"
                      onClick={() => setShowInvitePassword((value) => !value)}
                    >
                      {showInvitePassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <label className="auth-form__field">
                  <span>Confirm password</span>
                  <div className="auth-form__password-wrapper">
                    <input
                      type={showInviteConfirm ? 'text' : 'password'}
                      value={inviteForm.confirm}
                      onChange={(event) => setInviteForm({ ...inviteForm, confirm: event.currentTarget.value })}
                      required
                    />
                    <button
                      type="button"
                      className="auth-form__toggle"
                      onClick={() => setShowInviteConfirm((value) => !value)}
                    >
                      {showInviteConfirm ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </label>
                <button className="primary" type="submit" disabled={loading}>
                  {loading ? 'Joining…' : 'Join workspace'}
                </button>
              </form>
            </>
          )}
          {!inviteLoading && !inviteError && !invitePreview && <p className="auth-card__subtitle">This invite is no longer available.</p>}
        </>
      )}

      {mode === 'login' && (
        <form className="auth-form" onSubmit={handleLogin}>
          <label className="auth-form__field">
            <span>Email</span>
            <input
              type="email"
              value={loginForm.email}
              onChange={(event) => setLoginForm({ ...loginForm, email: event.currentTarget.value })}
              required
            />
          </label>
          <label className="auth-form__field">
            <span>Password</span>
            <div className="auth-form__password-wrapper">
              <input
                type={showLoginPassword ? 'text' : 'password'}
                value={loginForm.password}
                onChange={(event) => setLoginForm({ ...loginForm, password: event.currentTarget.value })}
                required
              />
              <button
                className="auth-form__toggle"
                type="button"
                onClick={() => setShowLoginPassword((visible) => !visible)}
                aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
              >
                {showLoginPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          <button className="auth-card__primary" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {mode === 'register' && (
        <form className="auth-form" onSubmit={handleRegister}>
          <label className="auth-form__field">
            <span>Name</span>
            <input
              type="text"
              value={registerForm.name}
              onChange={(event) => setRegisterForm({ ...registerForm, name: event.currentTarget.value })}
              required
            />
          </label>
          <label className="auth-form__field">
            <span>Email</span>
            <input
              type="email"
              value={registerForm.email}
              onChange={(event) => setRegisterForm({ ...registerForm, email: event.currentTarget.value })}
              required
            />
          </label>
          <label className="auth-form__field">
            <span>Password</span>
            <div className="auth-form__password-wrapper">
              <input
                type={showRegisterPassword ? 'text' : 'password'}
                minLength={4}
                value={registerForm.password}
                onChange={(event) => setRegisterForm({ ...registerForm, password: event.currentTarget.value })}
                required
              />
              <button
                className="auth-form__toggle"
                type="button"
                onClick={() => setShowRegisterPassword((visible) => !visible)}
                aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
              >
                {showRegisterPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          <button className="auth-card__primary" type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}

      {mode === 'forgot' && (
        <form className="auth-form" onSubmit={handleForgot}>
          <label className="auth-form__field">
            <span>Email</span>
            <input
              type="email"
              value={forgotEmail}
              onChange={(event) => setForgotEmail(event.currentTarget.value)}
              required
            />
          </label>
          <button className="auth-card__primary" type="submit" disabled={loading}>
            {loading ? 'Submitting…' : 'Send reset link'}
          </button>
        </form>
      )}

      {mode === 'reset' && (
        <form className="auth-form" onSubmit={handleReset}>
          <label className="auth-form__field">
            <span>New password</span>
            <div className="auth-form__password-wrapper">
              <input
                type={showResetPassword ? 'text' : 'password'}
                minLength={4}
                value={resetForm.password}
                onChange={(event) => setResetForm({ ...resetForm, password: event.currentTarget.value })}
                required
              />
              <button
                className="auth-form__toggle"
                type="button"
                onClick={() => setShowResetPassword((visible) => !visible)}
                aria-label={showResetPassword ? 'Hide password' : 'Show password'}
              >
                {showResetPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          <label className="auth-form__field">
            <span>Confirm password</span>
            <div className="auth-form__password-wrapper">
              <input
                type={showResetConfirm ? 'text' : 'password'}
                minLength={4}
                value={resetForm.confirm}
                onChange={(event) => setResetForm({ ...resetForm, confirm: event.currentTarget.value })}
                required
              />
              <button
                className="auth-form__toggle"
                type="button"
                onClick={() => setShowResetConfirm((visible) => !visible)}
                aria-label={showResetConfirm ? 'Hide password' : 'Show password'}
              >
                {showResetConfirm ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </label>
          <label className="auth-form__field">
            <span>Reset token</span>
            <input
              type="text"
              value={resetToken}
              onChange={(event) => setResetToken(event.currentTarget.value)}
              required
            />
          </label>
          <button className="auth-card__primary" type="submit" disabled={loading}>
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}
    </aside>
  );
};

export default AuthPanel;

const EyeIcon = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.036 12.322a.75.75 0 010-.644C3.741 7.99 7.553 5.25 12 5.25c4.448 0 8.26 2.74 9.964 6.428a.75.75 0 010 .644C20.26 16.01 16.448 18.75 12 18.75c-4.448 0-8.26-2.74-9.964-6.428z" />
    <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const EyeOffIcon = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.98 8.223c-1.045 1.277-1.73 2.655-1.944 3.455a.643.643 0 000 .356C3.806 16.06 7.52 19 12 19c1.61 0 3.164-.372 4.596-1.043" />
    <path d="M6.228 6.228A9.969 9.969 0 0112 5c4.48 0 8.194 2.94 9.964 7.322a.643.643 0 010 .356 10.07 10.07 0 01-1.25 2.255" />
    <path d="M9.88 9.88a3 3 0 104.24 4.24" />
    <path d="M3 3l18 18" />
  </svg>
);
