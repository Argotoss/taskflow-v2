import crypto from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { TokenService } from '../modules/auth/tokens.js';
import { verifyPassword } from '../modules/auth/hash.js';

type UserStoreRecord = {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatarUrl: string | null;
  timezone: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PreferenceStoreRecord = {
  id: string;
  userId: string;
  emailMentions: boolean;
  emailTaskUpdates: boolean;
  inAppMentions: boolean;
  inAppTaskUpdates: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AuthTokenStoreRecord = {
  id: string;
  userId: string;
  type: 'REFRESH' | 'RESET_PASSWORD';
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
};

type UserFindArgs = {
  where: { id?: string; email?: string };
  include?: { notificationPreference?: boolean };
};

type AuthTokenFindArgs = {
  where: { tokenHash: string };
  select?: { id?: boolean; userId?: boolean; type?: boolean; expiresAt?: boolean };
};

const createPreference = (userId: string): PreferenceStoreRecord => {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    userId,
    emailMentions: true,
    emailTaskUpdates: true,
    inAppMentions: true,
    inAppTaskUpdates: true,
    createdAt: now,
    updatedAt: now
  };
};

const hashToken = (token: string): string => crypto.createHash('sha256').update(token).digest('hex');

describe('auth routes integration', () => {
  let app: FastifyInstance;
  const users = new Map<string, UserStoreRecord>();
  const usersByEmail = new Map<string, string>();
  const preferences = new Map<string, PreferenceStoreRecord>();
  const authTokens = new Map<string, AuthTokenStoreRecord>();

  const resetStores = (): void => {
    users.clear();
    usersByEmail.clear();
    preferences.clear();
    authTokens.clear();
  };

  const resolveUserId = (where: { id?: string; email?: string }): string | undefined => {
    if (where.id) {
      return where.id;
    }
    if (where.email) {
      return usersByEmail.get(where.email);
    }
    return undefined;
  };

  const userFindUnique = async (args: UserFindArgs): Promise<unknown> => {
    const userId = resolveUserId(args.where);
    if (!userId) {
      return null;
    }
    const stored = users.get(userId);
    if (!stored) {
      return null;
    }
    const base: UserStoreRecord = {
      ...stored,
      createdAt: new Date(stored.createdAt),
      updatedAt: new Date(stored.updatedAt)
    };

    if (args.include?.notificationPreference) {
      const preference = preferences.get(userId) ?? null;
      return {
        ...base,
        notificationPreference: preference
          ? {
              ...preference,
              createdAt: new Date(preference.createdAt),
              updatedAt: new Date(preference.updatedAt)
            }
          : null
      };
    }

    const { id, email, passwordHash, name, avatarUrl, timezone, createdAt, updatedAt } = base;
    return { id, email, passwordHash, name, avatarUrl, timezone, createdAt, updatedAt };
  };

  const userCreate = async (args: {
    data: {
      email: string;
      passwordHash: string;
      name: string;
      notificationPreference?: { create?: Record<string, never> };
    };
    include?: { notificationPreference?: boolean };
  }): Promise<unknown> => {
    const now = new Date();
    const id = crypto.randomUUID();
    const record: UserStoreRecord = {
      id,
      email: args.data.email,
      passwordHash: args.data.passwordHash,
      name: args.data.name,
      avatarUrl: null,
      timezone: null,
      createdAt: now,
      updatedAt: now
    };

    users.set(id, record);
    usersByEmail.set(record.email, id);

    let preference: PreferenceStoreRecord | null = null;
    if (args.data.notificationPreference?.create) {
      preference = createPreference(id);
      preferences.set(id, preference);
    }

    if (args.include?.notificationPreference) {
      return {
        ...record,
        createdAt: new Date(record.createdAt),
        updatedAt: new Date(record.updatedAt),
        notificationPreference: preference
      };
    }

    return { ...record, createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt) };
  };

  const userUpdate = async (args: {
    where: { id: string };
    data: { passwordHash?: string };
  }): Promise<UserStoreRecord> => {
    const existing = users.get(args.where.id);
    if (!existing) {
      throw new Error('User not found');
    }
    const next: UserStoreRecord = {
      ...existing,
      passwordHash: args.data.passwordHash ?? existing.passwordHash,
      updatedAt: new Date()
    };
    users.set(existing.id, next);
    return { ...next, createdAt: new Date(next.createdAt), updatedAt: new Date(next.updatedAt) };
  };

  const preferenceCreate = async (args: { data: { userId: string } }): Promise<PreferenceStoreRecord> => {
    const preference = createPreference(args.data.userId);
    preferences.set(args.data.userId, preference);
    return preference;
  };

const authTokenCreate = async (args: {
  data: {
    userId: string;
    tokenHash: string;
    type: 'REFRESH' | 'RESET_PASSWORD';
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  };
}): Promise<AuthTokenStoreRecord> => {
  const now = new Date();
  const record: AuthTokenStoreRecord = {
    id: crypto.randomUUID(),
    userId: args.data.userId,
    type: args.data.type,
    tokenHash: args.data.tokenHash,
    expiresAt: new Date(args.data.expiresAt),
    userAgent: args.data.userAgent ?? null,
    ipAddress: args.data.ipAddress ?? null,
    createdAt: now
  };
  authTokens.set(record.id, record);
  return record;
};

  const authTokenFindUnique = async (args: AuthTokenFindArgs): Promise<unknown> => {
    const entry = Array.from(authTokens.values()).find((token) => token.tokenHash === args.where.tokenHash);
    if (!entry) {
      return null;
    }
    const selected: Record<string, unknown> = {};
    const fields = args.select ?? { id: true, userId: true, type: true, expiresAt: true };
    if (fields.id) {
      selected.id = entry.id;
    }
    if (fields.userId) {
      selected.userId = entry.userId;
    }
    if (fields.type) {
      selected.type = entry.type;
    }
    if (fields.expiresAt) {
      selected.expiresAt = new Date(entry.expiresAt);
    }
    return selected;
  };

const authTokenDelete = async (args: { where: { id: string } }): Promise<AuthTokenStoreRecord | null> => {
  const existing = authTokens.get(args.where.id) ?? null;
  if (existing) {
    authTokens.delete(args.where.id);
  }
  return existing;
};

  const matchesToken = (
    criteria: { tokenHash?: string; userId?: string; type?: 'REFRESH' | 'RESET_PASSWORD' },
    token: AuthTokenStoreRecord
  ): boolean => {
    if (criteria.tokenHash && token.tokenHash !== criteria.tokenHash) {
      return false;
    }
    if (criteria.userId && token.userId !== criteria.userId) {
      return false;
    }
    if (criteria.type && token.type !== criteria.type) {
      return false;
    }
    return true;
  };

  const authTokenDeleteMany = async (args: {
    where: { tokenHash?: string; userId?: string; type?: 'REFRESH' | 'RESET_PASSWORD' };
  }): Promise<{ count: number }> => {
    let count = 0;
    for (const [key, token] of authTokens.entries()) {
      if (matchesToken(args.where, token)) {
        authTokens.delete(key);
        count += 1;
      }
    }
    return { count };
  };

  const setupPrismaSpies = (): void => {
    vi.spyOn(app.prisma.user, 'findUnique').mockImplementation(userFindUnique as never);
    vi.spyOn(app.prisma.user, 'create').mockImplementation(userCreate as never);
    vi.spyOn(app.prisma.user, 'update').mockImplementation(userUpdate as never);
    vi.spyOn(app.prisma.notificationPreference, 'create').mockImplementation(preferenceCreate as never);
    vi.spyOn(app.prisma.authToken, 'create').mockImplementation(authTokenCreate as never);
    vi.spyOn(app.prisma.authToken, 'findUnique').mockImplementation(authTokenFindUnique as never);
    vi.spyOn(app.prisma.authToken, 'delete').mockImplementation(authTokenDelete as never);
    vi.spyOn(app.prisma.authToken, 'deleteMany').mockImplementation(authTokenDeleteMany as never);
    vi.spyOn(app.prisma, '$transaction').mockImplementation(async (operation: unknown) => {
      if (typeof operation === 'function') {
        const transactionClient = {
          authToken: {
            findUnique: authTokenFindUnique,
            delete: authTokenDelete,
            create: authTokenCreate
          }
        };
        const execute = operation as () => Promise<unknown> | unknown;
        return Promise.resolve(execute.call(undefined, transactionClient));
      }
      const tasks = Array.isArray(operation) ? operation : [];
      return Promise.all(tasks);
    });
  };

  beforeAll(async () => {
    app = buildApp();
    await app.ready();
    setupPrismaSpies();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetStores();
  });

  it('manages session lifecycle end to end', async () => {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'flow@test.dev',
        password: 'ComplexPass123!',
        name: 'Flow User'
      }
    });

    expect(registerResponse.statusCode).toBe(201);
    const registerBody = registerResponse.json();
    const userId = registerBody.user.id as string;
    expect(users.get(userId)?.email).toBe('flow@test.dev');

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'flow@test.dev',
        password: 'ComplexPass123!'
      }
    });

    expect(loginResponse.statusCode).toBe(200);
    const loginBody = loginResponse.json();
    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: loginBody.tokens.refreshToken
      }
    });

    expect(refreshResponse.statusCode).toBe(200);
    const refreshed = refreshResponse.json();
    expect(typeof refreshed.accessToken).toBe('string');
    const hashedRefresh = hashToken(refreshed.refreshToken as string);

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        authorization: `Bearer ${loginBody.tokens.accessToken}`
      },
      payload: {
        refreshToken: refreshed.refreshToken
      }
    });

    expect(logoutResponse.statusCode).toBe(204);
    const remainingHashes = Array.from(authTokens.values()).map((token) => token.tokenHash);
    expect(remainingHashes).not.toContain(hashedRefresh);
  });

  it('supports password reset after issuing a token', async () => {
    const registerResponse = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'recover@test.dev',
        password: 'InitialPass123!',
        name: 'Recover User'
      }
    });

    expect(registerResponse.statusCode).toBe(201);
    const registered = registerResponse.json();
    const userId = registered.user.id as string;
    const initialHash = users.get(userId)?.passwordHash ?? '';
    let resetTokenValue = '';
    const realCreateReset = TokenService.prototype.createPasswordResetToken;
    const createResetSpy = vi
      .spyOn(TokenService.prototype, 'createPasswordResetToken')
      .mockImplementation(async function (this: TokenService, ...params) {
        const value = await realCreateReset.apply(this, params);
        resetTokenValue = value;
        return value;
      });

    const forgotResponse = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {
        email: 'recover@test.dev'
      }
    });

    expect(forgotResponse.statusCode).toBe(202);
    expect(resetTokenValue).not.toHaveLength(0);

    createResetSpy.mockRestore();

    const resetResponse = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token: resetTokenValue,
        password: 'BrandNewPass456!'
      }
    });

    expect(resetResponse.statusCode).toBe(204);
    const updatedHash = users.get(userId)?.passwordHash ?? '';
    expect(updatedHash).not.toBe(initialHash);
    expect(await verifyPassword(updatedHash, 'BrandNewPass456!')).toBe(true);
    const remainingSessions = Array.from(authTokens.values()).filter((token) => token.userId === userId);
    expect(remainingSessions.length).toBe(0);
  });
});
