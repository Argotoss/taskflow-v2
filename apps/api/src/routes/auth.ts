import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  loginResponseSchema,
  refreshBodySchema,
  refreshResponseSchema,
  registerBodySchema,
  resetPasswordBodySchema,
  userDetailSchema
} from '@taskflow/types';
import { hashPassword, verifyPassword } from '../modules/auth/hash.js';
import { TokenService, type TokenContext } from '../modules/auth/tokens.js';
import { requireUserId } from '../utils/current-user.js';
import { clearRefreshTokenCookie, refreshTokenCookieName, setRefreshTokenCookie } from '../utils/refresh-cookie.js';
import { environment } from '../config/environment.js';

type UserDetail = z.infer<typeof userDetailSchema>;

const serializeUser = (user: {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null | undefined;
  timezone: string | null | undefined;
  createdAt: Date;
  updatedAt: Date;
}): UserDetail =>
  userDetailSchema.parse({
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl ?? null,
    timezone: user.timezone ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  });

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const buildContext = (request: FastifyRequest): TokenContext => {
  const userAgentHeader = request.headers['user-agent'];
  return {
    userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
    ipAddress: typeof request.ip === 'string' ? request.ip : undefined
  };
};

export const registerAuthRoutes = async (app: FastifyInstance): Promise<void> => {
  const tokens = new TokenService(app);

  app.post('/auth/register', async (request, reply) => {
    const body = registerBodySchema.parse(request.body);
    const email = normalizeEmail(body.email);

    const existing = await app.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw app.httpErrors.conflict('Account already exists for this email');
    }

    const passwordHash = await hashPassword(body.password);
    const user = await app.prisma.user.create({
      data: {
        email,
        passwordHash,
        name: body.name
      }
    });

    const session = await tokens.createSession(user.id, buildContext(request));
    setRefreshTokenCookie(reply, session.refreshToken);

    reply.code(201);
    return loginResponseSchema.parse({
      user: serializeUser(user),
      tokens: session
    });
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const email = normalizeEmail(body.email);

    const user = await app.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw app.httpErrors.unauthorized('Invalid credentials');
    }

    const valid = await verifyPassword(user.passwordHash, body.password);
    if (!valid) {
      throw app.httpErrors.unauthorized('Invalid credentials');
    }

    const session = await tokens.createSession(user.id, buildContext(request));
    setRefreshTokenCookie(reply, session.refreshToken);

    return loginResponseSchema.parse({
      user: serializeUser(user),
      tokens: session
    });
  });

  app.post('/auth/refresh', async (request, reply) => {
    const bodyInput = typeof request.body === 'object' && request.body !== null ? request.body : {};
    const body = refreshBodySchema.parse(bodyInput);
    const cookieToken = request.cookies?.[refreshTokenCookieName];
    const providedToken = typeof body.refreshToken === 'string' ? body.refreshToken : undefined;
    const refreshToken = providedToken ?? (typeof cookieToken === 'string' ? cookieToken : undefined);

    if (!refreshToken) {
      throw app.httpErrors.unauthorized('Refresh token missing');
    }

    const session = await tokens.rotateSession(refreshToken, buildContext(request));
    if (!session) {
      throw app.httpErrors.unauthorized('Refresh token invalid');
    }

    setRefreshTokenCookie(reply, session.refreshToken);
    return refreshResponseSchema.parse(session);
  });

  app.post('/auth/logout', async (request, reply) => {
    const userId = await requireUserId(request);
    const bodyInput = typeof request.body === 'object' && request.body !== null ? request.body : {};
    const body = refreshBodySchema.parse(bodyInput);
    const cookieToken = request.cookies?.[refreshTokenCookieName];
    const providedToken = typeof body.refreshToken === 'string' ? body.refreshToken : undefined;

    if (providedToken) {
      await tokens.revokeSession(providedToken);
    } else if (typeof cookieToken === 'string') {
      await tokens.revokeSession(cookieToken);
    } else {
      await tokens.revokeAllSessions(userId);
    }

    clearRefreshTokenCookie(reply);
    reply.code(204);
    return null;
  });

  app.post('/auth/forgot-password', async (request, reply) => {
    const body = forgotPasswordBodySchema.parse(request.body);
    const email = normalizeEmail(body.email);

    const user = await app.prisma.user.findUnique({ where: { email } });
    if (user) {
      const resetToken = await tokens.createPasswordResetToken(user.id, buildContext(request));
      if (environment.NODE_ENV !== 'production') {
        request.log.info({ email, resetToken }, 'Password reset token issued');
      }
    }

    reply.code(202);
    return null;
  });

  app.post('/auth/reset-password', async (request, reply) => {
    const body = resetPasswordBodySchema.parse(request.body);
    const userId = await tokens.consumePasswordResetToken(body.token);

    if (!userId) {
      throw app.httpErrors.unauthorized('Reset token invalid or expired');
    }

    const passwordHash = await hashPassword(body.password);
    const user = await app.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash
      }
    });

    await tokens.revokeAllSessions(user.id);
    clearRefreshTokenCookie(reply);

    reply.code(204);
    return null;
  });
};
