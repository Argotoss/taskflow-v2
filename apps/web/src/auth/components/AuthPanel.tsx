import { useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { useAuth } from '../useAuth.js';
import { ApiError } from '../authApi.js';

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
        <h2>Welcome back</h2>
        <p className="auth-card__subtitle">Signed in as {auth.user.name}</p>
        <button className="auth-card__primary" type="button" onClick={() => { clearFeedback(); void auth.logout(); }}>
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
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm({ ...loginForm, password: event.currentTarget.value })}
              required
            />
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
            <input
              type="password"
              minLength={12}
              value={registerForm.password}
              onChange={(event) => setRegisterForm({ ...registerForm, password: event.currentTarget.value })}
              required
            />
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
            <input
              type="password"
              minLength={12}
              value={resetForm.password}
              onChange={(event) => setResetForm({ ...resetForm, password: event.currentTarget.value })}
              required
            />
          </label>
          <label className="auth-form__field">
            <span>Confirm password</span>
            <input
              type="password"
              minLength={12}
              value={resetForm.confirm}
              onChange={(event) => setResetForm({ ...resetForm, confirm: event.currentTarget.value })}
              required
            />
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
