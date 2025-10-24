import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { buildApp } from '../app.js';
import { TokenService } from '../modules/auth/tokens.js';
import type { TokenPair } from '../modules/auth/tokens.js';
import { hashPassword } from '../modules/auth/hash.js';
import {
  buildMembership,
  buildNotificationPreference,
  buildUser,
  buildUserWithPreferences,
  buildWorkspaceInvite,
  type WorkspaceInviteRecord
} from '../testing/builders.js';

const refreshCookieName = 'taskflow_refresh_token';
const demoUserId = '123e4567-e89b-12d3-a456-426614174000';

const mockTokens: TokenPair = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 900
};

const now = new Date('2024-01-01T00:00:00Z');

type InviteOverrides = Partial<WorkspaceInviteRecord> & { workspaceName?: string };

const buildInviteWithWorkspace = (overrides: InviteOverrides = {}): WorkspaceInviteRecord & {
  workspace: { id: string; name: string };
} => {
  const { workspaceName, ...inviteOverrides } = overrides;
  const invite = buildWorkspaceInvite(inviteOverrides);
  return {
    ...invite,
    workspace: {
      id: invite.workspaceId,
      name: workspaceName ?? 'Demo Workspace'
    }
  };
};

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
    const createdUser = buildUserWithPreferences({
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
      updatedAt: now
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
      buildUserWithPreferences({
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
      buildUserWithPreferences({
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
        updatedAt: now
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

  it('previews invite details', async () => {
    const inviteToken = '6ec0d384-a3a8-4b35-8f1e-6e445f061a45';
    const expiresAt = new Date(Date.now() + 3600_000);
    vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockResolvedValue(
      buildInviteWithWorkspace({
        token: inviteToken,
        expiresAt,
        workspaceName: 'Demo Workspace'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.findFirst>>
    );

    const response = await app.inject({
      method: 'GET',
      url: `/auth/invite/${inviteToken}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.invitedEmail).toBe('invitee@taskflow.app');
  });

  it('returns 404 when invite missing', async () => {
    vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockResolvedValue(null);

    const response = await app.inject({
      method: 'GET',
      url: `/auth/invite/11111111-1111-1111-1111-111111111111`
    });

    expect(response.statusCode).toBe(404);
  });

  it('accepts invite by creating a new account', async () => {
    const inviteToken = '5a4057f6-8d19-4cf6-9c13-32b62ed2e2d2';
    const invite = buildInviteWithWorkspace({
      token: inviteToken,
      email: 'new.member@taskflow.app',
      workspaceId: 'workspace-1',
      role: 'CONTRIBUTOR',
      expiresAt: new Date(Date.now() + 3600_000),
      workspaceName: 'Workspace One'
    });
    const { workspace: _workspace, ...inviteRecord } = invite;
    void _workspace;

    vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockResolvedValue(invite as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.findFirst>>);
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(null);

    const createdUser = buildUserWithPreferences({
      id: demoUserId,
      email: inviteRecord.email,
      name: 'New Member',
      createdAt: now,
      updatedAt: now
    });

    const userCreateSpy = vi.spyOn(app.prisma.user, 'create').mockResolvedValue(createdUser);
    const membershipCreateSpy = vi.spyOn(app.prisma.membership, 'create').mockResolvedValue(
      buildMembership({
        id: 'membership-1',
        workspaceId: inviteRecord.workspaceId,
        userId: demoUserId,
        role: inviteRecord.role
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.create>>
    );
    const inviteUpdateSpy = vi.spyOn(app.prisma.workspaceInvite, 'update').mockResolvedValue(
      buildWorkspaceInvite({
        ...inviteRecord,
        acceptedAt: new Date()
      }) as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.update>>
    );

    vi.spyOn(app.prisma, '$transaction').mockImplementation(async (callback) => callback(app.prisma));

    const response = await app.inject({
      method: 'POST',
      url: '/auth/invite/accept',
      payload: {
        token: inviteToken,
        name: 'New Member',
        password: 'ComplexPass123!'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(userCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: invite.email,
          name: 'New Member'
        })
      })
    );
    expect(membershipCreateSpy).toHaveBeenCalled();
    expect(inviteUpdateSpy).toHaveBeenCalled();
    expect(createSessionSpy).toHaveBeenCalledWith(demoUserId, expect.any(Object));
    const body = response.json();
    expect(body.tokens.accessToken).toBe(mockTokens.accessToken);
  });

  it('requires name when creating account via invite', async () => {
    const invite = buildInviteWithWorkspace({
      token: '04c2759f-91f6-45e2-8b77-40c8a0e442c6',
      email: 'new.member@taskflow.app',
      workspaceId: 'workspace-1',
      role: 'CONTRIBUTOR',
      expiresAt: new Date(Date.now() + 3600_000)
    });

    vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockResolvedValue(invite as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.findFirst>>);
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/invite/accept',
      payload: {
        token: invite.token,
        password: 'ComplexPass123!'
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('requires password when creating account via invite', async () => {
    const invite = buildInviteWithWorkspace({
      token: '2d093642-37d2-4f69-b83d-a10b3d5d3ba7',
      email: 'new.member@taskflow.app',
      workspaceId: 'workspace-1',
      role: 'CONTRIBUTOR',
      expiresAt: new Date(Date.now() + 3600_000)
    });

    vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockResolvedValue(invite as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.findFirst>>);
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/invite/accept',
      payload: {
        token: invite.token,
        name: 'New Member'
      }
    });

    expect(response.statusCode).toBe(400);
  });

  it('accepts invite for existing user after verifying password', async () => {
    const invite = buildInviteWithWorkspace({
      token: '3c266048-f787-4eee-9ed3-d51054f50c6d',
      email: 'existing@taskflow.app',
      workspaceId: 'workspace-1',
      role: 'ADMIN',
      expiresAt: new Date(Date.now() + 3600_000)
    });
    const { workspace: _workspaceInvite, ...inviteRecord } = invite;
    void _workspaceInvite;

    vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockResolvedValue(invite as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.findFirst>>);

    const passwordHash = await hashPassword('ComplexPass123!');
    const existingUser = buildUserWithPreferences({
      id: demoUserId,
      email: inviteRecord.email,
      passwordHash,
      notificationPreference: buildNotificationPreference({
        id: 'pref-existing',
        userId: demoUserId,
        createdAt: now,
        updatedAt: now
      })
    });

    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(existingUser);

    const upsertSpy = vi.spyOn(app.prisma.membership, 'upsert').mockResolvedValue(
      buildMembership({
        id: 'membership-existing',
        workspaceId: inviteRecord.workspaceId,
        userId: demoUserId,
        role: 'ADMIN'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.upsert>>
    );

    const inviteUpdateSpy = vi.spyOn(app.prisma.workspaceInvite, 'update').mockResolvedValue(
      buildWorkspaceInvite({
        ...inviteRecord,
        acceptedAt: new Date()
      }) as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.update>>
    );

    const userReloadSpy = vi.spyOn(app.prisma.user, 'findUniqueOrThrow').mockResolvedValue(existingUser);
    const notificationCreateSpy = vi.spyOn(app.prisma.notification, 'create').mockResolvedValue({} as never);

    vi.spyOn(app.prisma, '$transaction').mockImplementation(async (callback) => callback(app.prisma));

    const response = await app.inject({
      method: 'POST',
      url: '/auth/invite/accept',
      payload: {
        token: invite.token,
        name: 'Existing User',
        password: 'ComplexPass123!'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(upsertSpy).toHaveBeenCalled();
    expect(inviteUpdateSpy).toHaveBeenCalled();
    expect(userReloadSpy).toHaveBeenCalledWith({
      where: { id: demoUserId },
      include: { notificationPreference: true }
    });
    expect(notificationCreateSpy).toHaveBeenCalledWith({
      data: {
        userId: demoUserId,
        type: 'WORKSPACE_JOINED',
        payload: {
          workspaceId: inviteRecord.workspaceId,
          workspaceName: invite.workspace.name
        }
      }
    });
    expect(createSessionSpy).toHaveBeenCalledWith(demoUserId, expect.any(Object));
  });

  it('accepts invite for authenticated user without requiring password', async () => {
    const invite = buildInviteWithWorkspace({
      token: 'e2c3f9ae-76f2-4d40-8a92-9049ddab7c07',
      email: 'existing@taskflow.app',
      workspaceId: 'workspace-1',
      role: 'ADMIN',
      expiresAt: new Date(Date.now() + 3600_000)
    });
    const { workspace: _workspaceAuthenticated, ...inviteRecord } = invite;
    void _workspaceAuthenticated;

    vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockResolvedValue(invite as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.findFirst>>);

    const existingUser = buildUserWithPreferences({
      id: demoUserId,
      email: inviteRecord.email,
      passwordHash: await hashPassword('ComplexPass123!'),
      notificationPreference: buildNotificationPreference({
        id: 'pref-existing',
        userId: demoUserId,
        createdAt: now,
        updatedAt: now
      })
    });

    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(existingUser);

    const upsertSpy = vi.spyOn(app.prisma.membership, 'upsert').mockResolvedValue(
      buildMembership({
        id: 'membership-existing',
        workspaceId: inviteRecord.workspaceId,
        userId: demoUserId,
        role: 'ADMIN'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.upsert>>
    );

    const inviteUpdateSpy = vi.spyOn(app.prisma.workspaceInvite, 'update').mockResolvedValue(
      buildWorkspaceInvite({
        ...inviteRecord,
        acceptedAt: new Date()
      }) as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.update>>
    );

    const userReloadSpy = vi.spyOn(app.prisma.user, 'findUniqueOrThrow').mockResolvedValue(existingUser);
    const notificationCreateSpy = vi.spyOn(app.prisma.notification, 'create').mockResolvedValue({} as never);

    vi.spyOn(app.prisma, '$transaction').mockImplementation(async (callback) => callback(app.prisma));

    const response = await app.inject({
      method: 'POST',
      url: '/auth/invite/accept',
      headers: buildAuthHeader(app),
      payload: {
        token: invite.token
      }
    });

    expect(response.statusCode).toBe(200);
    expect(upsertSpy).toHaveBeenCalled();
    expect(inviteUpdateSpy).toHaveBeenCalled();
    expect(userReloadSpy).toHaveBeenCalled();
    expect(notificationCreateSpy).toHaveBeenCalledWith({
      data: {
        userId: demoUserId,
        type: 'WORKSPACE_JOINED',
        payload: {
          workspaceId: inviteRecord.workspaceId,
          workspaceName: invite.workspace.name
        }
      }
    });
    expect(createSessionSpy).toHaveBeenCalledWith(demoUserId, expect.any(Object));
  });

  it('does not duplicate workspace joined notification when membership already exists', async () => {
    const invite = buildInviteWithWorkspace({
      token: '7ef0a9e1-79a8-4845-8d0d-04c2e9478f78',
      email: 'existing@taskflow.app',
      workspaceId: 'workspace-1',
      role: 'ADMIN',
      expiresAt: new Date(Date.now() + 3600_000)
    });
    const { workspace: _workspaceExisting, ...inviteRecord } = invite;
    void _workspaceExisting;

    vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockResolvedValue(invite as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.findFirst>>);

    const passwordHash = await hashPassword('ComplexPass123!');
    const existingUser = buildUserWithPreferences({
      id: demoUserId,
      email: inviteRecord.email,
      passwordHash,
      notificationPreference: buildNotificationPreference({
        id: 'pref-existing',
        userId: demoUserId,
        createdAt: now,
        updatedAt: now
      })
    });

    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(existingUser);

    const upsertSpy = vi.spyOn(app.prisma.membership, 'upsert').mockResolvedValue(
      buildMembership({
        id: 'membership-existing',
        workspaceId: inviteRecord.workspaceId,
        userId: demoUserId,
        role: 'ADMIN',
        createdAt: new Date('2024-01-01T00:00:00Z'),
        updatedAt: new Date('2024-01-05T00:00:00Z')
      }) as unknown as Awaited<ReturnType<typeof app.prisma.membership.upsert>>
    );

    const inviteUpdateSpy = vi.spyOn(app.prisma.workspaceInvite, 'update').mockResolvedValue(
      buildWorkspaceInvite({
        ...inviteRecord,
        acceptedAt: new Date()
      }) as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.update>>
    );

    vi.spyOn(app.prisma.user, 'findUniqueOrThrow').mockResolvedValue(existingUser);
    const notificationCreateSpy = vi.spyOn(app.prisma.notification, 'create').mockResolvedValue({} as never);

    vi.spyOn(app.prisma, '$transaction').mockImplementation(async (callback) => callback(app.prisma));

    const response = await app.inject({
      method: 'POST',
      url: '/auth/invite/accept',
      payload: {
        token: invite.token,
        name: 'Existing User',
        password: 'ComplexPass123!'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(upsertSpy).toHaveBeenCalled();
    expect(inviteUpdateSpy).toHaveBeenCalled();
    expect(notificationCreateSpy).not.toHaveBeenCalled();
  });

  it('lists pending invites for authenticated user', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(
      buildUser({
        id: demoUserId,
        email: 'owner@taskflow.app'
      }) as unknown as Awaited<ReturnType<typeof app.prisma.user.findUnique>>
    );

    const inviteRecord = {
      token: '90d54d64-cb1a-4671-9e77-2cf7383cc2b4',
      workspaceId: '11111111-1111-1111-1111-111111111111',
      email: 'owner@taskflow.app',
      role: 'ADMIN',
      expiresAt: new Date(Date.now() + 3600_000),
      acceptedAt: null,
      workspace: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Demo Workspace'
      },
      createdAt: now
    };

    vi.spyOn(app.prisma.workspaceInvite, 'findMany').mockResolvedValue([inviteRecord] as unknown as Awaited<ReturnType<typeof app.prisma.workspaceInvite.findMany>>);

    const response = await app.inject({
      method: 'GET',
      url: '/auth/invites',
      headers: buildAuthHeader(app)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      {
        token: inviteRecord.token,
        workspaceId: inviteRecord.workspaceId,
        workspaceName: inviteRecord.workspace.name,
        role: inviteRecord.role,
        expiresAt: inviteRecord.expiresAt.toISOString()
      }
    ]);
  });
});
