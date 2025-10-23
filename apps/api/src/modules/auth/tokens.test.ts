import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { TokenService } from './tokens.js';

interface AuthTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  type: 'REFRESH' | 'RESET_PASSWORD';
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
  issuedAt?: Date;
  lastUsedAt?: Date | null;
}

const hash = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

const buildAppStub = () => {
  const store: AuthTokenRecord[] = [];
  let identifier = 0;

  const authTokenCreate = vi.fn(async ({ data }: { data: Omit<AuthTokenRecord, 'id'> }) => {
    const record: AuthTokenRecord = {
      id: `token-${++identifier}`,
      ...data
    };
    store.push(record);
    return record;
  });

  const authTokenFindUnique = vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
    return store.find((record) => record.tokenHash === where.tokenHash) ?? null;
  });

  const authTokenDelete = vi.fn(async ({ where }: { where: { id: string } }) => {
    const index = store.findIndex((record) => record.id === where.id);
    if (index === -1) {
      return null;
    }
    const [removed] = store.splice(index, 1);
    return removed;
  });

  const authTokenDeleteMany = vi.fn(async ({ where }: { where: { userId?: string; tokenHash?: string; type?: 'REFRESH' | 'RESET_PASSWORD' } }) => {
    const initialSize = store.length;
    for (let index = store.length - 1; index >= 0; index -= 1) {
      const record = store[index];
      if (typeof where.tokenHash === 'string' && record.tokenHash !== where.tokenHash) {
        continue;
      }
      if (typeof where.userId === 'string' && record.userId !== where.userId) {
        continue;
      }
      if (typeof where.type === 'string' && record.type !== where.type) {
        continue;
      }
      store.splice(index, 1);
    }
    return { count: initialSize - store.length };
  });

  const buildTransactionClient = () => ({
    authToken: {
      create: authTokenCreate,
      findUnique: authTokenFindUnique,
      delete: authTokenDelete,
      deleteMany: authTokenDeleteMany
    }
  });

  const prismaStub = {
    authToken: {
      create: authTokenCreate,
      findUnique: authTokenFindUnique,
      delete: authTokenDelete,
      deleteMany: authTokenDeleteMany
    },
    $transaction: vi.fn(async (callback) => {
      const transactionClient = buildTransactionClient();
      return callback(transactionClient);
    })
  };

  const jwtStub = {
    sign: vi.fn(({ sub }: { sub: string }) => `signed-${sub}`)
  };

  return {
    app: {
      jwt: jwtStub,
      prisma: prismaStub
    } as unknown as FastifyInstance,
    store,
    authTokenCreate,
    authTokenFindUnique,
    authTokenDelete,
    authTokenDeleteMany,
    prismaStub,
    jwtStub
  };
};

describe('TokenService', () => {
  let appStub: ReturnType<typeof buildAppStub>;
  let service: TokenService;

  beforeEach(() => {
    appStub = buildAppStub();
    service = new TokenService(appStub.app);
  });

  it('creates a session and stores hashed refresh token with context', async () => {
    const session = await service.createSession('user-1', { userAgent: 'jest', ipAddress: '127.0.0.1' });

    expect(session.accessToken).toBe('signed-user-1');
    expect(session.expiresIn).toBeGreaterThan(0);
    expect(appStub.store).toHaveLength(1);
    const stored = appStub.store[0];
    expect(stored.tokenHash).toBe(hash(session.refreshToken));
    expect(stored.userAgent).toBe('jest');
    expect(stored.ipAddress).toBe('127.0.0.1');
    expect(stored.type).toBe('REFRESH');
    expect(stored.lastUsedAt).toBeInstanceOf(Date);
  });

  it('rotates refresh tokens and replaces stored record', async () => {
    const original = await service.createSession('user-2');
    const rotated = await service.rotateSession(original.refreshToken, { ipAddress: '192.168.1.10' });

    expect(rotated).not.toBeNull();
    expect(rotated?.refreshToken).not.toBe(original.refreshToken);
    expect(appStub.store).toHaveLength(1);
    const stored = appStub.store[0];
    expect(stored.ipAddress).toBe('192.168.1.10');
    expect(stored.tokenHash).toBe(hash(rotated!.refreshToken));
    expect(stored.lastUsedAt).toBeInstanceOf(Date);
  });

  it('returns null when rotating unknown token', async () => {
    const result = await service.rotateSession('missing-token');
    expect(result).toBeNull();
  });

  it('revokes a specific session', async () => {
    const session = await service.createSession('user-3');
    expect(appStub.store).toHaveLength(1);
    await service.revokeSession(session.refreshToken);
    expect(appStub.store).toHaveLength(0);
  });

  it('revokes all sessions for a user', async () => {
    await service.createSession('user-3');
    await service.createSession('user-3');
    await service.createSession('user-4');
    await service.revokeAllSessions('user-3');
    expect(appStub.store.every((record) => record.userId !== 'user-3')).toBe(true);
  });

  it('creates and consumes password reset tokens', async () => {
    const token = await service.createPasswordResetToken('user-5', { userAgent: 'jest' });
    expect(appStub.store[0].type).toBe('RESET_PASSWORD');
    const userId = await service.consumePasswordResetToken(token);
    expect(userId).toBe('user-5');
    expect(appStub.store).toHaveLength(0);
  });

  it('returns null when consuming invalid reset tokens', async () => {
    const result = await service.consumePasswordResetToken('invalid');
    expect(result).toBeNull();
  });

  it('does not allow reuse of refresh tokens after rotation', async () => {
    const original = await service.createSession('user-6');
    const rotated = await service.rotateSession(original.refreshToken);
    expect(rotated).not.toBeNull();
    const reuseAttempt = await service.rotateSession(original.refreshToken);
    expect(reuseAttempt).toBeNull();
    expect(appStub.store).toHaveLength(1);
  });

  it('rejects expired refresh tokens and removes them', async () => {
    const session = await service.createSession('user-7');
    const stored = appStub.store[0];
    stored.expiresAt = new Date(Date.now() - 1);
    const result = await service.rotateSession(session.refreshToken);
    expect(result).toBeNull();
    expect(appStub.store).toHaveLength(0);
  });

  it('replaces previous reset tokens for the same user', async () => {
    const first = await service.createPasswordResetToken('user-8');
    const firstHash = hash(first);
    expect(appStub.store.length).toBe(1);
    const second = await service.createPasswordResetToken('user-8');
    expect(hash(second)).not.toBe(firstHash);
    expect(appStub.store.length).toBe(1);
    expect(appStub.store[0].tokenHash).toBe(hash(second));
  });

  it('returns null when consuming reset tokens twice', async () => {
    const token = await service.createPasswordResetToken('user-9');
    const initial = await service.consumePasswordResetToken(token);
    expect(initial).toBe('user-9');
    const second = await service.consumePasswordResetToken(token);
    expect(second).toBeNull();
  });
});
