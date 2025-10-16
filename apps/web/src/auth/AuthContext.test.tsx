import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authTokensSchema, userDetailSchema } from '@taskflow/types';
import type { LoginResponse } from '@taskflow/types';
import { AuthProvider } from './AuthContext.js';
import { useAuth } from './useAuth.js';

const mockAuthApi = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refresh: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn()
}));

vi.mock('./authApi.ts', () => ({
  authApi: mockAuthApi,
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
}));

describe('AuthProvider', () => {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => <AuthProvider>{children}</AuthProvider>;

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.values(mockAuthApi).forEach((fn) => fn.mockReset());
    const loginResponse: LoginResponse = {
      user: {
        id: randomUUID(),
        email: 'ava@taskflow.app',
        name: 'Ava Stewart',
        avatarUrl: null,
        timezone: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notificationPreferences: {
          emailMentions: true,
          emailTaskUpdates: true,
          inAppMentions: true,
          inAppTaskUpdates: true
        }
      },
      tokens: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900
      }
    };

    mockAuthApi.refresh.mockResolvedValue({ accessToken: 'refresh-access', refreshToken: 'refresh-token', expiresIn: 900 });
    mockAuthApi.logout.mockResolvedValue(undefined);
    mockAuthApi.login.mockResolvedValue(loginResponse);
    mockAuthApi.register.mockResolvedValue(loginResponse);
    mockAuthApi.requestPasswordReset.mockResolvedValue(undefined);
    mockAuthApi.resetPassword.mockResolvedValue(undefined);
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('hydrates from stored session', async () => {
    const storedSession = {
      user: {
        id: randomUUID(),
        email: 'ava@taskflow.app',
        name: 'Ava Stewart',
        avatarUrl: null,
        timezone: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notificationPreferences: {
          emailMentions: true,
          emailTaskUpdates: true,
          inAppMentions: true,
          inAppTaskUpdates: true
        }
      },
      tokens: {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresIn: 900,
        issuedAt: Date.now()
      }
    };

    const verifySchema = z.object({
      user: userDetailSchema,
      tokens: authTokensSchema.extend({ issuedAt: z.number().int().nonnegative() })
    });
    const parseResult = verifySchema.safeParse(storedSession);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    window.localStorage.setItem('taskflow.session', JSON.stringify(storedSession));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
      expect(result.current.session).not.toBeNull();
    });

    expect(result.current.user?.email).toBe('ava@taskflow.app');
  });

  it('logs in and logs out', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.login({ email: 'ava@taskflow.app', password: 'ComplexPass123!' });
    });

    expect(result.current.user?.name).toBe('Ava Stewart');
    expect(window.localStorage.getItem('taskflow.session')).toContain('access-token');

    await act(async () => {
      await result.current.logout();
    });

    expect(mockAuthApi.logout).toHaveBeenCalledWith('access-token', 'refresh-token');
    expect(result.current.user).toBeNull();
    expect(window.localStorage.getItem('taskflow.session')).toBeNull();
  });
});
