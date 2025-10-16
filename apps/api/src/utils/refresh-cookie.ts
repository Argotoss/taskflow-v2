import type { FastifyReply } from 'fastify';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { environment } from '../config/environment.js';

export const refreshTokenCookieName = 'taskflow_refresh_token';

const refreshCookieOptions: CookieSerializeOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: environment.NODE_ENV === 'production',
  path: '/',
  maxAge: environment.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60
};

export const setRefreshTokenCookie = (reply: FastifyReply, value: string): void => {
  reply.setCookie(refreshTokenCookieName, value, refreshCookieOptions);
};

export const clearRefreshTokenCookie = (reply: FastifyReply): void => {
  reply.clearCookie(refreshTokenCookieName, refreshCookieOptions);
};
