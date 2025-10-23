import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '@taskflow/db';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  loginResponseSchema,
  refreshBodySchema,
  refreshResponseSchema,
  registerBodySchema,
  resetPasswordBodySchema,
  invitePreviewQuerySchema,
  invitePreviewResponseSchema,
  inviteAcceptBodySchema
} from '@taskflow/types';
import { hashPassword, verifyPassword } from '../modules/auth/hash.js';
import { TokenService, type TokenContext } from '../modules/auth/tokens.js';
import { requireUserId } from '../utils/current-user.js';
import { clearRefreshTokenCookie, refreshTokenCookieName, setRefreshTokenCookie } from '../utils/refresh-cookie.js';
import { serializeUser } from '../utils/serialize-user.js';
import { environment } from '../config/environment.js';

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const buildContext = (request: FastifyRequest): TokenContext => {
  const userAgentHeader = request.headers['user-agent'];
  return {
    userAgent: typeof userAgentHeader === 'string' ? userAgentHeader : undefined,
    ipAddress: typeof request.ip === 'string' ? request.ip : undefined
  };
};

const authRateLimitConfig = (): { max: number; timeWindow: number } => ({
  max: environment.AUTH_RATE_LIMIT_MAX,
  timeWindow: environment.AUTH_RATE_LIMIT_TIME_WINDOW_MS
});

export const registerAuthRoutes = async (app: FastifyInstance): Promise<void> => {
  const tokens = new TokenService(app);

  app.post('/auth/register', { config: { rateLimit: authRateLimitConfig() } }, async (request, reply) => {
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
        name: body.name,
        notificationPreference: {
          create: {}
        }
      },
      include: {
        notificationPreference: true
      }
    });

    const session = await tokens.createSession(user.id, buildContext(request));
    setRefreshTokenCookie(reply, session.refreshToken);

    reply.code(201);
    return loginResponseSchema.parse({
      user: serializeUser(user, user.notificationPreference),
      tokens: session
    });
  });

  app.post('/auth/login', { config: { rateLimit: authRateLimitConfig() } }, async (request, reply) => {
    const body = loginBodySchema.parse(request.body);
    const email = normalizeEmail(body.email);

    const user = await app.prisma.user.findUnique({
      where: { email },
      include: {
        notificationPreference: true
      }
    });
    if (!user) {
      throw app.httpErrors.unauthorized('Invalid credentials');
    }

    const valid = await verifyPassword(user.passwordHash, body.password);
    if (!valid) {
      throw app.httpErrors.unauthorized('Invalid credentials');
    }

    const preference =
      user.notificationPreference ??
      (await app.prisma.notificationPreference.create({
        data: { userId: user.id }
      }));

    const session = await tokens.createSession(user.id, buildContext(request));
    setRefreshTokenCookie(reply, session.refreshToken);

    return loginResponseSchema.parse({
      user: serializeUser(user, preference),
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

  app.post('/auth/forgot-password', { config: { rateLimit: authRateLimitConfig() } }, async (request, reply) => {
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

  app.post('/auth/reset-password', { config: { rateLimit: authRateLimitConfig() } }, async (request, reply) => {
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

  app.get('/auth/invite/:token', async (request) => {
    const params = invitePreviewQuerySchema.parse(request.params);

    const invite = await app.prisma.workspaceInvite.findFirst({
      where: {
        token: params.token,
        acceptedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!invite) {
      throw app.httpErrors.notFound('Invite not found or expired');
    }

    return {
      data: invitePreviewResponseSchema.parse({
        workspaceId: invite.workspace.id,
        workspaceName: invite.workspace.name,
        invitedEmail: invite.email,
        role: invite.role
      })
    };
  });

  app.post('/auth/invite/accept', { config: { rateLimit: authRateLimitConfig() } }, async (request, reply) => {
    const body = inviteAcceptBodySchema.parse(request.body);

    const invite = await app.prisma.workspaceInvite.findFirst({
      where: {
        token: body.token
      }
    });

    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
      throw app.httpErrors.notFound('Invite not found or expired');
    }

    const existingUser = await app.prisma.user.findUnique({
      where: {
        email: invite.email
      },
      include: {
        notificationPreference: true
      }
    });

    if (existingUser) {
      type ExistingUserWithPreference = Prisma.UserGetPayload<{
        include: { notificationPreference: true };
      }>;
      const userRecord = existingUser as ExistingUserWithPreference;

      const valid = await verifyPassword(userRecord.passwordHash, body.password);
      if (!valid) {
        throw app.httpErrors.unauthorized('Invalid credentials for invited account');
      }

      const now = new Date();

      const { user, preference } = await app.prisma.$transaction(async (tx) => {
        await tx.membership.upsert({
          where: {
            workspaceId_userId: {
              workspaceId: invite.workspaceId,
              userId: userRecord.id
            }
          },
          create: {
            workspaceId: invite.workspaceId,
            userId: userRecord.id,
            role: invite.role
          },
          update: {
            role: invite.role
          }
        });

        let preferenceRecord = userRecord.notificationPreference;
        if (!preferenceRecord) {
          preferenceRecord = await tx.notificationPreference.create({
            data: {
              userId: userRecord.id
            }
          });
        }

        await tx.workspaceInvite.update({
          where: { id: invite.id },
          data: {
            acceptedAt: now
          }
        });

        const reloaded = await tx.user.findUniqueOrThrow({
          where: { id: userRecord.id },
          include: {
            notificationPreference: true
          }
        });

        return { user: reloaded, preference: preferenceRecord ?? reloaded.notificationPreference };
      });

      const session = await tokens.createSession(user.id, buildContext(request));
      setRefreshTokenCookie(reply, session.refreshToken);

      return loginResponseSchema.parse({
        user: serializeUser(user, preference),
        tokens: session
      });
    }

    if (!body.name) {
      throw app.httpErrors.badRequest('Name is required to create an account');
    }

    const accountName = body.name;
    const passwordHash = await hashPassword(body.password);
    const now = new Date();

    const { user, preference } = await app.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: invite.email,
          passwordHash,
          name: accountName,
          notificationPreference: {
            create: {}
          }
        },
        include: {
          notificationPreference: true
        }
      });

      await tx.membership.create({
        data: {
          workspaceId: invite.workspaceId,
          userId: createdUser.id,
          role: invite.role
        }
      });

      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: {
          acceptedAt: now
        }
      });

      return { user: createdUser, preference: createdUser.notificationPreference };
    });

    const session = await tokens.createSession(user.id, buildContext(request));
    setRefreshTokenCookie(reply, session.refreshToken);

    reply.code(201);
    return loginResponseSchema.parse({
      user: serializeUser(user, preference),
      tokens: session
    });
  });
};
