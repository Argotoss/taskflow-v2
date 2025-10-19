import { useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import type { UpdateProfileBody } from '@taskflow/types';
import { useAuth } from '../useAuth.js';
import { ApiError } from '../authApi.js';
import ProfileForm from './ProfileForm.js';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const resolveInitialMode = (): { mode: AuthMode; token: string } => {
  if (typeof window === 'undefined') {
    return { mode: 'login', token: '' };
  }

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (typeof token === 'string' && token.length > 0) {
    return { mode: 'reset', token };
  }

  return { mode: 'login', token: '' };
};

const modeLabels: Record<AuthMode, string> = {
  login: 'Sign in',
  register: 'Create account',
  forgot: 'Request reset link',
  reset: 'Choose new password'
};

const AuthPanel = (): JSX.Element => {
  const auth = useAuth();
  const initial = useMemo(resolveInitialMode, []);
  const [mode, setMode] = useState<AuthMode>(initial.mode);
  const [resetToken, setResetToken] = useState(initial.token);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetForm, setResetForm] = useState({ password: '', confirm: '' });
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileStatus, setProfileStatus] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  const clearFeedback = (): void => {
    setError('');
    setStatusMessage('');
  };

  const switchMode = (nextMode: AuthMode): void => {
    setMode(nextMode);
    clearFeedback();
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

  if (!auth.ready) {
    return (
      <aside className="auth-card">
        <h2>Authentication</h2>
        <p>Loading…</p>
      </aside>
    );
  }

  if (auth.user) {
    return (
      <aside className="auth-card">
        <h2>Account</h2>
        <p className="auth-card__subtitle">Signed in as {auth.user.email}</p>
        {profileError && <div className="auth-card__error">{profileError}</div>}
        {profileStatus && <div className="auth-card__status">{profileStatus}</div>}
        <ProfileForm user={auth.user} submitting={profileSaving} onSubmit={handleProfileSubmit} />
        <button
          className="auth-card__link"
          type="button"
          onClick={() => {
            clearFeedback();
            void handleSignOut();
          }}
        >
          Sign out
        </button>
      </aside>
    );
  }

  return (
    <aside className="auth-card">
      <div className="auth-card__header">
        <h2>{modeLabels[mode]}</h2>
        {mode !== 'login' && (
          <button className="auth-card__link" type="button" onClick={() => switchMode('login')}>
            Sign in
          </button>
        )}
        {mode !== 'register' && (
          <button className="auth-card__link" type="button" onClick={() => switchMode('register')}>
            Create account
          </button>
        )}
        {mode !== 'forgot' && (
          <button className="auth-card__link" type="button" onClick={() => switchMode('forgot')}>
            Reset password
          </button>
        )}
      </div>

      {error && <div className="auth-card__error">{error}</div>}
      {statusMessage && <div className="auth-card__status">{statusMessage}</div>}

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
