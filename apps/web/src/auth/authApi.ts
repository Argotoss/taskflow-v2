import {
  loginResponseSchema,
  refreshResponseSchema,
  forgotPasswordBodySchema,
  resetPasswordBodySchema,
  registerBodySchema,
  loginBodySchema,
  profileResponseSchema,
  updateProfileBodySchema,
  invitePreviewResponseSchema,
  inviteAcceptBodySchema,
  invitePreviewQuerySchema,
  listAuthInvitesResponseSchema
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
  UserDetail,
  AuthInviteSummary
} from '@taskflow/types';
import { z } from 'zod';
import { request, authorizationHeaders, serializeBody, ApiError, requireAccessToken } from '../api/httpClient.js';

const invitePreviewResponseWrapper = z.object({
  data: invitePreviewResponseSchema
});

export const authApi = {
  async register(payload: RegisterBody): Promise<LoginResponse> {
    const body = registerBodySchema.parse(payload);
    return request('/auth/register', {
      method: 'POST',
      body: serializeBody(body)
    }, loginResponseSchema);
  },
  async login(payload: LoginBody): Promise<LoginResponse> {
    const body = loginBodySchema.parse(payload);
    return request('/auth/login', {
      method: 'POST',
      body: serializeBody(body)
    }, loginResponseSchema);
  },
  async logout(accessToken: string | null, refreshToken: string | null): Promise<void> {
    const input = refreshToken ? { refreshToken } : {};
    return request('/auth/logout', {
      method: 'POST',
      headers: authorizationHeaders(accessToken),
      body: serializeBody(input)
    });
  },
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    return request('/auth/refresh', {
      method: 'POST',
      body: serializeBody({ refreshToken })
    }, refreshResponseSchema);
  },
  async requestPasswordReset(email: string): Promise<void> {
    const body: ForgotPasswordBody = forgotPasswordBodySchema.parse({ email });
    return request('/auth/forgot-password', {
      method: 'POST',
      body: serializeBody(body)
    });
  },
  async resetPassword(payload: ResetPasswordBody): Promise<void> {
    const body = resetPasswordBodySchema.parse(payload);
    return request('/auth/reset-password', {
      method: 'POST',
      body: serializeBody(body)
    });
  },
  async profile(accessToken: string | null): Promise<UserDetail> {
    if (!accessToken) {
      throw new ApiError('Authentication required', 401);
    }
    const response = await request('/auth/me', {
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
    const response = await request('/auth/me', {
      method: 'PATCH',
      headers: authorizationHeaders(accessToken),
      body: serializeBody(body)
    }, profileResponseSchema);
    return response.user;
  },
  async previewInvite(token: string) {
    const params = invitePreviewQuerySchema.parse({ token });
    const response = await request(`/auth/invite/${params.token}`, {
      method: 'GET'
    }, invitePreviewResponseWrapper);
    return response.data;
  },
  async acceptInvite(payload: z.infer<typeof inviteAcceptBodySchema>, accessToken?: string | null): Promise<LoginResponse> {
    const body = inviteAcceptBodySchema.parse(payload);
    const headers = accessToken ? authorizationHeaders(accessToken) : undefined;
    return request('/auth/invite/accept', {
      method: 'POST',
      headers,
      body: serializeBody(body)
    }, loginResponseSchema);
  },
  async listInvites(accessToken: string | null): Promise<AuthInviteSummary[]> {
    const token = requireAccessToken(accessToken);
    const response = await request('/auth/invites', {
      method: 'GET',
      headers: authorizationHeaders(token)
    }, listAuthInvitesResponseSchema);
    return response.data;
  }
};

export type ApiAuthTokens = AuthTokens;
export type ApiLoginResponse = LoginResponse;
export type ApiRefreshResponse = RefreshResponse;
export { ApiError };
