import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type * as fastifyJwt from '@fastify/jwt';
import type { AuthTokenType } from '@taskflow/types';
import type { Prisma, PrismaClient } from '@taskflow/db';
import { environment } from '../../config/environment.js';

const tokenHash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

const refreshTokenLifetimeMs = environment.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
const resetTokenLifetimeMs = environment.RESET_PASSWORD_TOKEN_TTL_MINUTES * 60 * 1000;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface TokenContext {
  userAgent?: string;
  ipAddress?: string;
}

const now = (): Date => new Date();

export class TokenService {
  private readonly app: FastifyInstance;

  constructor(app: FastifyInstance) {
    this.app = app;
  }

  private get prisma(): PrismaClient {
    return this.app.prisma;
  }

  private get jwt(): fastifyJwt.JWT {
    return this.app.jwt;
  }

  private async signAccessToken(userId: string): Promise<string> {
    return this.jwt.sign({ sub: userId, type: 'access' });
  }

  private refreshExpiry(): Date {
    return new Date(now().getTime() + refreshTokenLifetimeMs);
  }

  private resetExpiry(): Date {
    return new Date(now().getTime() + resetTokenLifetimeMs);
  }

  private async storeToken(
    prismaClient: PrismaClient | Prisma.TransactionClient,
    params: {
      userId: string;
      tokenValue: string;
      type: AuthTokenType;
      expiresAt: Date;
      context?: TokenContext;
    }
  ): Promise<void> {
    await prismaClient.authToken.create({
      data: {
        userId: params.userId,
        tokenHash: tokenHash(params.tokenValue),
        type: params.type,
        expiresAt: params.expiresAt,
        userAgent: params.context?.userAgent,
        ipAddress: params.context?.ipAddress
      }
    });
  }

  async createSession(userId: string, context?: TokenContext): Promise<TokenPair> {
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = this.refreshExpiry();

    await this.storeToken(this.prisma, {
      userId,
      tokenValue: refreshToken,
      type: 'REFRESH',
      expiresAt,
      context
    });

    return {
      accessToken: await this.signAccessToken(userId),
      refreshToken,
      expiresIn: environment.JWT_EXPIRES_IN_SECONDS
    };
  }

  async rotateSession(refreshToken: string, context?: TokenContext): Promise<TokenPair | null> {
    const hashed = tokenHash(refreshToken);
    const currentTime = now().getTime();

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.authToken.findUnique({
        where: { tokenHash: hashed },
        select: {
          id: true,
          userId: true,
          type: true,
          expiresAt: true
        }
      });

      if (!existing || existing.type !== 'REFRESH') {
        if (existing) {
          await transaction.authToken.delete({ where: { id: existing.id } });
        }
        return null;
      }

      if (existing.expiresAt.getTime() <= currentTime) {
        await transaction.authToken.delete({ where: { id: existing.id } });
        return null;
      }

      await transaction.authToken.delete({ where: { id: existing.id } });

      const nextRefreshToken = crypto.randomBytes(48).toString('hex');
      await this.storeToken(transaction, {
        userId: existing.userId,
        tokenValue: nextRefreshToken,
        type: 'REFRESH',
        expiresAt: this.refreshExpiry(),
        context
      });

      return {
        accessToken: await this.signAccessToken(existing.userId),
        refreshToken: nextRefreshToken,
        expiresIn: environment.JWT_EXPIRES_IN_SECONDS
      };
    });
  }

  async revokeSession(refreshToken: string): Promise<void> {
    await this.prisma.authToken.deleteMany({
      where: {
        tokenHash: tokenHash(refreshToken),
        type: 'REFRESH'
      }
    });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.authToken.deleteMany({
      where: {
        userId,
        type: 'REFRESH'
      }
    });
  }

  async createPasswordResetToken(userId: string, context?: TokenContext): Promise<string> {
    const token = crypto.randomBytes(48).toString('hex');
    await this.storeToken(this.prisma, {
      userId,
      tokenValue: token,
      type: 'RESET_PASSWORD',
      expiresAt: this.resetExpiry(),
      context
    });
    return token;
  }

  async consumePasswordResetToken(tokenValue: string): Promise<string | null> {
    const hashed = tokenHash(tokenValue);
    const currentTime = now().getTime();

    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.authToken.findUnique({
        where: { tokenHash: hashed },
        select: {
          id: true,
          userId: true,
          type: true,
          expiresAt: true
        }
      });

      if (!existing || existing.type !== 'RESET_PASSWORD') {
        if (existing) {
          await transaction.authToken.delete({ where: { id: existing.id } });
        }
        return null;
      }

      if (existing.expiresAt.getTime() <= currentTime) {
        await transaction.authToken.delete({ where: { id: existing.id } });
        return null;
      }

      await transaction.authToken.delete({ where: { id: existing.id } });
      return existing.userId;
    });
  }
}
