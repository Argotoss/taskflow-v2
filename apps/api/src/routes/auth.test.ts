import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { buildApp } from '../app.js';
import { TokenService } from '../modules/auth/tokens.js';
import type { TokenPair } from '../modules/auth/tokens.js';
import { hashPassword } from '../modules/auth/hash.js';
import { buildNotificationPreference, buildUser } from '../testing/user.js';

const refreshCookieName = 'taskflow_refresh_token';
const demoUserId = '123e4567-e89b-12d3-a456-426614174000';

const mockTokens: TokenPair = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 900
};

const now = new Date('2024-01-01T00:00:00Z');

const buildAuthHeader = (appInstance: ReturnType<typeof buildApp>): { authorization: string } => ({
  authorization: `Bearer ${appInstance.jwt.sign({ sub: demoUserId, type: 'access' })}`
});

let createSessionSpy: MockInstance<Parameters<TokenService['createSession']>, ReturnType<TokenService['createSession']>>;
let rotateSessionSpy: MockInstance<Parameters<TokenService['rotateSession']>, ReturnType<TokenService['rotateSession']>>;
let revokeSessionSpy: MockInstance<Parameters<TokenService['revokeSession']>, ReturnType<TokenService['revokeSession']>>;
let revokeAllSessionsSpy: MockInstance<Parameters<TokenService['revokeAllSessions']>, ReturnType<TokenService['revokeAllSessions']>>;
let createPasswordResetTokenSpy: MockInstance<Parameters<TokenService['createPasswordResetToken']>, ReturnType<TokenService['createPasswordResetToken']>>;
let consumePasswordResetTokenSpy: MockInstance<Parameters<TokenService['consumePasswordResetToken']>, ReturnType<TokenService['consumePasswordResetToken']>>;

describe('auth routes', () => {
  const app = buildApp();

  beforeEach(async () => {
    await app.ready();
    createSessionSpy = vi.spyOn(TokenService.prototype, 'createSession').mockResolvedValue(mockTokens);
    rotateSessionSpy = vi.spyOn(TokenService.prototype, 'rotateSession').mockResolvedValue(mockTokens);
    revokeSessionSpy = vi.spyOn(TokenService.prototype, 'revokeSession').mockResolvedValue();
    revokeAllSessionsSpy = vi.spyOn(TokenService.prototype, 'revokeAllSessions').mockResolvedValue();
    createPasswordResetTokenSpy = vi.spyOn(TokenService.prototype, 'createPasswordResetToken').mockResolvedValue('reset-token');
    consumePasswordResetTokenSpy = vi.spyOn(TokenService.prototype, 'consumePasswordResetToken').mockResolvedValue(demoUserId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a new account', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(null);
    const createdUser = buildUser({
      id: demoUserId,
      email: 'newuser@taskflow.app',
      name: 'New User',
      createdAt: now,
      updatedAt: now
    });
    const createSpy = vi.spyOn(app.prisma.user, 'create').mockResolvedValue(createdUser);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'NewUser@taskflow.app',
        password: 'ComplexPass123!',
        name: 'New User'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createSpy.mock.calls[0][0].data.email).toBe('newuser@taskflow.app');
    const savedHash = createSpy.mock.calls[0][0].data.passwordHash;
    expect(savedHash).not.toBe('ComplexPass123!');
    expect(createSessionSpy).toHaveBeenCalledWith(demoUserId, expect.any(Object));
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=`);
    const body = response.json();
    expect(body.tokens.refreshToken).toBe(mockTokens.refreshToken);
    expect(body.user.notificationPreferences.emailMentions).toBe(true);
  });

  it('rejects registration when email already exists', async () => {
    const existingUser = buildUser({
      id: demoUserId,
      email: 'existing@taskflow.app',
      name: 'Existing User',
      createdAt: now,
      updatedAt: now,
      notificationPreference: null
    });
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(existingUser);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'existing@taskflow.app',
        password: 'ComplexPass123!',
        name: 'Existing User'
      }
    });

    expect(response.statusCode).toBe(409);
  });

  it('logs in with valid credentials', async () => {
    const passwordHash = await hashPassword('ComplexPass123!');
    const notificationPreference = buildNotificationPreference({
      id: 'pref-existing',
      userId: demoUserId,
      createdAt: now,
      updatedAt: now,
      emailTaskUpdates: false,
      inAppTaskUpdates: false
    });
    const findUniqueSpy = vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(
      buildUser({
        id: demoUserId,
        email: 'user@taskflow.app',
        passwordHash,
        name: 'Demo User',
        createdAt: now,
        updatedAt: now,
        notificationPreference
      })
    );
    const preferenceCreateSpy = vi.spyOn(app.prisma.notificationPreference, 'create').mockResolvedValue(
      buildNotificationPreference({
        id: 'pref-1',
        userId: demoUserId,
        createdAt: now,
        updatedAt: now
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@taskflow.app',
        password: 'ComplexPass123!'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(createSessionSpy).toHaveBeenCalledWith(demoUserId, expect.any(Object));
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=`);
    expect(response.json().tokens.accessToken).toBe(mockTokens.accessToken);
    expect(response.json().user.notificationPreferences.emailMentions).toBe(true);
    expect(preferenceCreateSpy).not.toHaveBeenCalled();

    // Ensure include argument was provided
    expect(findUniqueSpy).toHaveBeenCalledWith({
      where: { email: 'user@taskflow.app' },
      include: { notificationPreference: true }
    });
  });

  it('creates notification preferences when absent during login', async () => {
    const passwordHash = await hashPassword('ComplexPass123!');
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(
      buildUser({
        id: demoUserId,
        email: 'user@taskflow.app',
        passwordHash,
        name: 'Demo User',
        createdAt: now,
        updatedAt: now,
        notificationPreference: null
      })
    );

    const preferenceCreateSpy = vi.spyOn(app.prisma.notificationPreference, 'create').mockResolvedValue(
      buildNotificationPreference({
        id: 'pref-2',
        userId: demoUserId,
        createdAt: now,
        updatedAt: now
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@taskflow.app',
        password: 'ComplexPass123!'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(preferenceCreateSpy).toHaveBeenCalledWith({ data: { userId: demoUserId } });
    const body = response.json();
    expect(body.user).toBeDefined();
    expect(body.user.notificationPreferences.emailMentions).toBe(true);
  });

  it('rejects invalid login attempts', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@taskflow.app',
        password: 'bad'
      }
    });

    expect(response.statusCode).toBe(401);
  });

  it('rotates refresh tokens', async () => {
    rotateSessionSpy.mockResolvedValueOnce(mockTokens);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: 'refresh-token'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(rotateSessionSpy).toHaveBeenCalledWith('refresh-token', expect.any(Object));
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=`);
  });

  it('rejects invalid refresh tokens', async () => {
    rotateSessionSpy.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: 'invalid'
      }
    });

    expect(response.statusCode).toBe(401);
  });

  it('logs out and clears refresh cookies', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: buildAuthHeader(app),
      payload: {
        refreshToken: 'refresh-token'
      }
    });

    expect(response.statusCode).toBe(204);
    expect(revokeSessionSpy).toHaveBeenCalledWith('refresh-token');
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=;`);
  });

  it('revokes all sessions when no refresh token provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: buildAuthHeader(app)
    });

    expect(response.statusCode).toBe(204);
    expect(revokeAllSessionsSpy).toHaveBeenCalledWith(demoUserId);
  });

  it('issues password reset token when account exists', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(
      buildUser({
        id: demoUserId,
        email: 'user@taskflow.app',
        name: 'Demo User',
        createdAt: now,
        updatedAt: now,
        notificationPreference: null
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {
        email: 'user@taskflow.app'
      }
    });

    expect(response.statusCode).toBe(202);
    expect(createPasswordResetTokenSpy).toHaveBeenCalledWith(demoUserId, expect.any(Object));
  });

  it('handles password reset submissions', async () => {
    const updateSpy = vi.spyOn(app.prisma.user, 'update').mockResolvedValue(
      buildUser({
        id: demoUserId,
        email: 'user@taskflow.app',
        passwordHash: 'new-hash',
        name: 'Demo User',
        createdAt: now,
        updatedAt: now
      })
    );

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token: 'reset-token',
        password: 'NewComplex123!'
      }
    });

    expect(response.statusCode).toBe(204);
    const updatedHash = updateSpy.mock.calls[0][0].data.passwordHash;
    expect(updatedHash).not.toBe('NewComplex123!');
    expect(consumePasswordResetTokenSpy).toHaveBeenCalledWith('reset-token');
    expect(revokeAllSessionsSpy).toHaveBeenCalledWith(demoUserId);
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=;`);
  });

  it('rejects reset attempts with invalid token', async () => {
    consumePasswordResetTokenSpy.mockResolvedValueOnce(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token: 'invalid',
        password: 'NewComplex123!'
      }
    });

    expect(response.statusCode).toBe(401);
  });
});
