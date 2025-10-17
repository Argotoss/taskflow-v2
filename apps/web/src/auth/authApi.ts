import {
  loginResponseSchema,
  refreshResponseSchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
  registerBodySchema,
  loginBodySchema,
  profileResponseSchema,
  updateProfileBodySchema
} from '@taskflow/types';
import type {
  AuthTokens,
  LoginResponse,
  ResetPasswordBody,
  RefreshResponse,
  ForgotPasswordBody,
  RegisterBody,
  LoginBody,
  UpdateProfileBody,
  UserDetail
} from '@taskflow/types';
import { z } from 'zod';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const buildBaseUrl = (): string => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.length > 0) {
    return configured;
  }
  const runtimeWindow = typeof window === 'undefined' ? undefined : window;
  if (runtimeWindow?.location) {
    return runtimeWindow.location.origin;
  }
  return 'http://localhost:3000';
};

const baseUrl = buildBaseUrl();

const jsonHeaders = {
  accept: 'application/json',
  'content-type': 'application/json'
};

const parseError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    const schema = z.object({ message: z.string().optional() });
    const parsed = schema.safeParse(data);
    if (parsed.success && parsed.data.message) {
      return parsed.data.message;
    }
  } catch {
    // ignore
  }
  return 'Request failed';
};

type RequestOptions = globalThis.RequestInit;

const buildRequest = async <Schema extends z.ZodTypeAny>(
  path: string,
  options: RequestOptions,
  schema?: Schema
): Promise<Schema extends z.ZodTypeAny ? z.infer<Schema> : void> => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...jsonHeaders,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await parseError(response);
    throw new ApiError(detail, response.status);
  }

  if (!schema || response.status === 204) {
    return undefined as Schema extends z.ZodTypeAny ? z.infer<Schema> : void;
  }

  const data = await response.json();
  return schema.parse(data) as Schema extends z.ZodTypeAny ? z.infer<Schema> : void;
};

const authorizationHeaders = (accessToken: string | null | undefined): Record<string, string> => {
  if (!accessToken) {
    return {};
  }
  return {
    authorization: `Bearer ${accessToken}`
  };
};

const serializeBody = (payload: unknown): string => JSON.stringify(payload);

export const authApi = {
  async register(payload: RegisterBody): Promise<LoginResponse> {
    const body = registerBodySchema.parse(payload);
    return buildRequest('/auth/register', {
      method: 'POST',
      body: serializeBody(body)
    }, loginResponseSchema);
  },
  async login(payload: LoginBody): Promise<LoginResponse> {
    const body = loginBodySchema.parse(payload);
    return buildRequest('/auth/login', {
      method: 'POST',
      body: serializeBody(body)
    }, loginResponseSchema);
  },
  async logout(accessToken: string | null, refreshToken: string | null): Promise<void> {
    const input = refreshToken ? { refreshToken } : {};
    return buildRequest('/auth/logout', {
      method: 'POST',
      headers: authorizationHeaders(accessToken),
      body: serializeBody(input)
    });
  },
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    return buildRequest('/auth/refresh', {
      method: 'POST',
      body: serializeBody({ refreshToken })
    }, refreshResponseSchema);
  },
  async requestPasswordReset(email: string): Promise<void> {
    const body: ForgotPasswordBody = forgotPasswordBodySchema.parse({ email });
    return buildRequest('/auth/forgot-password', {
      method: 'POST',
      body: serializeBody(body)
    });
  },
  async resetPassword(payload: ResetPasswordBody): Promise<void> {
    const body = resetPasswordBodySchema.parse(payload);
    return buildRequest('/auth/reset-password', {
      method: 'POST',
      body: serializeBody(body)
    });
  },
  async profile(accessToken: string | null): Promise<UserDetail> {
    if (!accessToken) {
      throw new ApiError('Authentication required', 401);
    }
    const response = await buildRequest('/auth/me', {
      method: 'GET',
      headers: authorizationHeaders(accessToken)
    }, profileResponseSchema);
    return response.user;
  },
  async updateProfile(accessToken: string | null, payload: UpdateProfileBody): Promise<UserDetail> {
    if (!accessToken) {
      throw new ApiError('Authentication required', 401);
    }
    const body = updateProfileBodySchema.parse(payload);
    const response = await buildRequest('/auth/me', {
      method: 'PATCH',
      headers: authorizationHeaders(accessToken),
      body: serializeBody(body)
    }, profileResponseSchema);
    return response.user;
  }
};

export type ApiAuthTokens = AuthTokens;
export type ApiLoginResponse = LoginResponse;
export type ApiRefreshResponse = RefreshResponse;
export { ApiError };
