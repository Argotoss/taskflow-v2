import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { TokenService } from '../modules/auth/tokens.js';
import { hashPassword } from '../modules/auth/hash.js';

const refreshCookieName = 'taskflow_refresh_token';
const demoUserId = '123e4567-e89b-12d3-a456-426614174000';

const mockTokens = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 900
};

const now = new Date('2024-01-01T00:00:00Z');

const buildAuthHeader = (appInstance: ReturnType<typeof buildApp>): { authorization: string } => ({
  authorization: `Bearer ${appInstance.jwt.sign({ sub: demoUserId, type: 'access' })}`
});

describe('auth routes', () => {
  const app = buildApp();

  beforeEach(async () => {
    await app.ready();
    vi.spyOn(TokenService.prototype, 'createSession').mockResolvedValue(mockTokens);
    vi.spyOn(TokenService.prototype, 'rotateSession').mockResolvedValue(mockTokens);
    vi.spyOn(TokenService.prototype, 'revokeSession').mockResolvedValue();
    vi.spyOn(TokenService.prototype, 'revokeAllSessions').mockResolvedValue();
    vi.spyOn(TokenService.prototype, 'createPasswordResetToken').mockResolvedValue('reset-token');
    vi.spyOn(TokenService.prototype, 'consumePasswordResetToken').mockResolvedValue(demoUserId);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a new account', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(null);
    const createSpy = vi.spyOn(app.prisma.user, 'create').mockImplementation(async ({ data }) => ({
      id: demoUserId,
      email: data.email,
      passwordHash: data.passwordHash,
      name: data.name,
      avatarUrl: null,
      timezone: null,
      createdAt: now,
      updatedAt: now,
      notificationPreference: {
        emailMentions: true,
        emailTaskUpdates: true,
        inAppMentions: true,
        inAppTaskUpdates: true
      }
    }));

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
    expect(TokenService.prototype.createSession).toHaveBeenCalledWith(demoUserId, expect.any(Object));
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=`);
    const body = response.json();
    expect(body.tokens.refreshToken).toBe(mockTokens.refreshToken);
    expect(body.user.notificationPreferences.emailMentions).toBe(true);
  });

  it('rejects registration when email already exists', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue({
      id: demoUserId,
      email: 'existing@taskflow.app',
      passwordHash: 'hash',
      name: 'Existing User',
      avatarUrl: null,
      timezone: null,
      createdAt: now,
      updatedAt: now,
      notificationPreference: null
    });

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
    const notificationPreference = {
      emailMentions: true,
      emailTaskUpdates: false,
      inAppMentions: true,
      inAppTaskUpdates: false
    };

    const findUniqueSpy = vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue({
      id: demoUserId,
      email: 'user@taskflow.app',
      passwordHash,
      name: 'Demo User',
      avatarUrl: null,
      timezone: null,
      createdAt: now,
      updatedAt: now,
      notificationPreference
    });
    const preferenceCreateSpy = vi.spyOn(app.prisma.notificationPreference, 'create').mockResolvedValue({
      id: 'pref-1',
      userId: demoUserId,
      ...notificationPreference,
      createdAt: now,
      updatedAt: now
    });

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'user@taskflow.app',
        password: 'ComplexPass123!'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(TokenService.prototype.createSession).toHaveBeenCalledWith(demoUserId, expect.any(Object));
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
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue({
      id: demoUserId,
      email: 'user@taskflow.app',
      passwordHash,
      name: 'Demo User',
      avatarUrl: null,
      timezone: null,
      createdAt: now,
      updatedAt: now,
      notificationPreference: null
    });

    const preferenceCreateSpy = vi.spyOn(app.prisma.notificationPreference, 'create').mockResolvedValue({
      id: 'pref-2',
      userId: demoUserId,
      emailMentions: true,
      emailTaskUpdates: true,
      inAppMentions: true,
      inAppTaskUpdates: true,
      createdAt: now,
      updatedAt: now
    });

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
    const rotateSpy = TokenService.prototype.rotateSession as unknown as vi.Mock;
    rotateSpy.mockResolvedValueOnce(mockTokens);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {
        refreshToken: 'refresh-token'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(rotateSpy).toHaveBeenCalledWith('refresh-token', expect.any(Object));
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=`);
  });

  it('rejects invalid refresh tokens', async () => {
    const rotateSpy = TokenService.prototype.rotateSession as unknown as vi.Mock;
    rotateSpy.mockResolvedValueOnce(null);

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
    const revokeSpy = TokenService.prototype.revokeSession as unknown as vi.Mock;

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: buildAuthHeader(app),
      payload: {
        refreshToken: 'refresh-token'
      }
    });

    expect(response.statusCode).toBe(204);
    expect(revokeSpy).toHaveBeenCalledWith('refresh-token');
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=;`);
  });

  it('revokes all sessions when no refresh token provided', async () => {
    const revokeAllSpy = TokenService.prototype.revokeAllSessions as unknown as vi.Mock;

    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: buildAuthHeader(app)
    });

    expect(response.statusCode).toBe(204);
    expect(revokeAllSpy).toHaveBeenCalledWith(demoUserId);
  });

  it('issues password reset token when account exists', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue({
      id: demoUserId,
      email: 'user@taskflow.app',
      passwordHash: 'hash',
      name: 'Demo User',
      avatarUrl: null,
      timezone: null,
      createdAt: now,
      updatedAt: now,
      notificationPreference: null
    });

    const createResetSpy = TokenService.prototype.createPasswordResetToken as unknown as vi.Mock;

    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {
        email: 'user@taskflow.app'
      }
    });

    expect(response.statusCode).toBe(202);
    expect(createResetSpy).toHaveBeenCalledWith(demoUserId, expect.any(Object));
  });

  it('handles password reset submissions', async () => {
    const updateSpy = vi.spyOn(app.prisma.user, 'update').mockResolvedValue({
      id: demoUserId,
      email: 'user@taskflow.app',
      passwordHash: 'new-hash',
      name: 'Demo User',
      avatarUrl: null,
      timezone: null,
      createdAt: now,
      updatedAt: now
    });

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
    expect(TokenService.prototype.consumePasswordResetToken).toHaveBeenCalledWith('reset-token');
    expect(TokenService.prototype.revokeAllSessions).toHaveBeenCalledWith(demoUserId);
    const setCookie = response.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookie) ? setCookie.join(';') : setCookie;
    expect(cookieHeader).toContain(`${refreshCookieName}=;`);
  });

  it('rejects reset attempts with invalid token', async () => {
    const consumeSpy = TokenService.prototype.consumePasswordResetToken as unknown as vi.Mock;
    consumeSpy.mockResolvedValueOnce(null);

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
