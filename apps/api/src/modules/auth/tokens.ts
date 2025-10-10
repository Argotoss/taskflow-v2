import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AuthTokenType } from '@taskflow/types';
import type * as fastifyJwt from '@fastify/jwt';
import { environment } from '../../config/environment.js';

const toHash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export class TokenService {
  private readonly app: FastifyInstance;

  constructor(app: FastifyInstance) {
    this.app = app;
  }

  private get jwt(): fastifyJwt.JWT {
    return this.app.jwt;
  }

  async generateAccessToken(payload: Record<string, unknown>): Promise<string> {
    return Promise.resolve(this.jwt.sign(payload));
  }

  async generateRefreshToken(userId: string, type: AuthTokenType = 'REFRESH'): Promise<TokenPair> {
    const rawToken = crypto.randomBytes(48).toString('hex');
    const hashed = toHash(rawToken);
    const expires = new Date();
    expires.setDate(expires.getDate() + environment.REFRESH_TOKEN_TTL_DAYS);

    await this.app.prisma.authToken.create({
      data: {
        userId,
        tokenHash: hashed,
        type,
        expiresAt: expires
      }
    });

    const accessToken = await this.generateAccessToken({ sub: userId });

    return {
      accessToken,
      refreshToken: rawToken,
      expiresIn: environment.JWT_EXPIRES_IN
    };
  }

  async rotateRefreshToken(userId: string, token: string): Promise<TokenPair | null> {
    const hashed = toHash(token);
    const stored = await this.app.prisma.authToken.findFirst({
      where: {
        userId,
        tokenHash: hashed,
        type: 'REFRESH'
      }
    });

    if (!stored || stored.expiresAt < new Date()) {
      return null;
    }

    await this.app.prisma.authToken.update({
      where: { id: stored.id },
      data: { lastUsedAt: new Date() }
    });

    return this.generateRefreshToken(userId);
  }

  async revokeRefreshTokens(userId: string): Promise<void> {
    await this.app.prisma.authToken.deleteMany({
      where: {
        userId,
        type: 'REFRESH'
      }
    });
  }
}
