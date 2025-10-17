import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PropsWithChildren, JSX } from 'react';
import { z } from 'zod';
import { authTokensSchema, userDetailSchema } from '@taskflow/types';
import type {
  LoginBody,
  RegisterBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  LoginResponse,
  UpdateProfileBody,
  UserDetail
} from '@taskflow/types';
import { authApi, ApiError } from './authApi.js';

const storedSessionSchema = z.object({
  user: userDetailSchema,
  tokens: authTokensSchema.extend({ issuedAt: z.number().int().nonnegative() })
});

type StoredSession = z.infer<typeof storedSessionSchema>;

/* eslint-disable @typescript-eslint/no-unused-vars, no-unused-vars */
interface AuthContextValue {
  user: UserDetail | null;
  ready: boolean;
  session: StoredSession | null;
  login: (credentials: LoginBody) => Promise<void>;
  register: (details: RegisterBody) => Promise<void>;
  logout: () => Promise<void>;
  requestPasswordReset: (email: ForgotPasswordBody['email']) => Promise<void>;
  resetPassword: (input: ResetPasswordBody) => Promise<void>;
  updateProfile: (changes: UpdateProfileBody) => Promise<void>;
}
/* eslint-enable @typescript-eslint/no-unused-vars, no-unused-vars */

const storageKey = 'taskflow.session';

const persistSession = (session: StoredSession | null): void => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  if (!session) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(session));
};

const readPersistedSession = (): StoredSession | null => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const result = storedSessionSchema.safeParse(parsed);
    if (!result.success) {
      window.localStorage.removeItem(storageKey);
      return null;
    }

    return result.data;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
};

const withIssuedAt = (response: LoginResponse): StoredSession => ({
  user: response.user,
  tokens: {
    ...response.tokens,
    issuedAt: Date.now()
  }
});

const expiryTime = (session: StoredSession): number => session.tokens.issuedAt + session.tokens.expiresIn * 1000;

const AuthContext = createContext<AuthContextValue | null>(null);

const usersEqual = (current: UserDetail, next: UserDetail): boolean => {
  return (
    current.name === next.name &&
    current.email === next.email &&
    current.avatarUrl === next.avatarUrl &&
    current.timezone === next.timezone &&
    current.updatedAt === next.updatedAt &&
    current.notificationPreferences.emailMentions === next.notificationPreferences.emailMentions &&
    current.notificationPreferences.emailTaskUpdates === next.notificationPreferences.emailTaskUpdates &&
    current.notificationPreferences.inAppMentions === next.notificationPreferences.inAppMentions &&
    current.notificationPreferences.inAppTaskUpdates === next.notificationPreferences.inAppTaskUpdates
  );
};

const AuthProvider = ({ children }: PropsWithChildren): JSX.Element => {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const persisted = readPersistedSession();
    if (persisted) {
      setSession(persisted);
    }
    setReady(true);
  }, []);

  const applySession = useCallback((next: StoredSession) => {
    setSession(next);
    persistSession(next);
  }, []);

  const replaceUser = useCallback((user: UserDetail) => {
    setSession((current) => {
      if (!current) {
        return current;
      }
      if (usersEqual(current.user, user)) {
        return current;
      }
      const next: StoredSession = {
        user,
        tokens: current.tokens
      };
      persistSession(next);
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    setSession(null);
    persistSession(null);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!session || refreshing) {
      return;
    }

    setRefreshing(true);
    try {
      const nextTokens = await authApi.refresh(session.tokens.refreshToken);
      const nextSession: StoredSession = {
        user: session.user,
        tokens: {
          ...nextTokens,
          issuedAt: Date.now()
        }
      };
      applySession(nextSession);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
      }
    } finally {
      setRefreshing(false);
    }
  }, [applySession, clearSession, refreshing, session]);

  useEffect(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    if (!session) {
      return;
    }

    const refreshAt = expiryTime(session) - 60_000;
    const delay = refreshAt - Date.now();

    if (delay <= 0) {
      void refreshSession();
      return;
    }

    refreshTimerRef.current = window.setTimeout(() => {
      void refreshSession();
    }, delay);

    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [refreshSession, session]);

  const login = useCallback(async (payload: LoginBody) => {
    const response = await authApi.login(payload);
    applySession(withIssuedAt(response));
  }, [applySession]);

  const register = useCallback(async (payload: RegisterBody) => {
    const response = await authApi.register(payload);
    applySession(withIssuedAt(response));
  }, [applySession]);

  const logout = useCallback(async () => {
    const current = session;
    await authApi.logout(current?.tokens.accessToken ?? null, current?.tokens.refreshToken ?? null);
    clearSession();
  }, [clearSession, session]);

  const requestPasswordReset = useCallback(async (email: ForgotPasswordBody['email']) => {
    await authApi.requestPasswordReset(email);
  }, []);

  const resetPassword = useCallback(async (payload: ResetPasswordBody) => {
    await authApi.resetPassword(payload);
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;

    const loadProfile = async (): Promise<void> => {
      try {
        const profile = await authApi.profile(session.tokens.accessToken);
        if (!cancelled) {
          replaceUser(profile);
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
        }
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [clearSession, replaceUser, session]);

  const updateProfile = useCallback(
    async (changes: UpdateProfileBody): Promise<void> => {
      const current = session;
      if (!current) {
        throw new ApiError('Authentication required', 401);
      }

      try {
        const updated = await authApi.updateProfile(current.tokens.accessToken, changes);
        replaceUser(updated);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSession();
        }
        throw error;
      }
    },
    [clearSession, replaceUser, session]
  );

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    ready,
    session,
    login,
    register,
    logout,
    requestPasswordReset,
    resetPassword,
    updateProfile
  }), [login, logout, ready, register, requestPasswordReset, resetPassword, session, updateProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export { AuthContext, AuthProvider };
export type { AuthContextValue, StoredSession };
