import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';

const userId = '123e4567-e89b-12d3-a456-426614174000';

const authHeaders = (appInstance: ReturnType<typeof buildApp>): { authorization: string } => ({
  authorization: `Bearer ${appInstance.jwt.sign({ sub: userId, type: 'access' })}`
});

describe('profile routes', () => {
  const app = buildApp();

  beforeEach(async () => {
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the current user profile', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue({
      id: userId,
      email: 'ava@taskflow.app',
      name: 'Ava Stewart',
      avatarUrl: null,
      timezone: 'UTC',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      notificationPreference: {
        emailMentions: true,
        emailTaskUpdates: false,
        inAppMentions: true,
        inAppTaskUpdates: true
      }
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe('ava@taskflow.app');
    expect(body.user.notificationPreferences.emailTaskUpdates).toBe(false);
  });

  it('creates default preferences when missing', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue({
      id: userId,
      email: 'ava@taskflow.app',
      name: 'Ava Stewart',
      avatarUrl: null,
      timezone: null,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      notificationPreference: null
    });

    const preferenceCreateSpy = vi.spyOn(app.prisma.notificationPreference, 'create').mockResolvedValue({
      id: 'pref-123',
      userId,
      emailMentions: true,
      emailTaskUpdates: true,
      inAppMentions: true,
      inAppTaskUpdates: true,
      createdAt: new Date('2024-01-02T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z')
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(preferenceCreateSpy).toHaveBeenCalledWith({ data: { userId } });
    expect(response.json().user.notificationPreferences.emailMentions).toBe(true);
  });

  it('updates profile fields and notification preferences', async () => {
    const updateSpy = vi.spyOn(app.prisma.user, 'update').mockResolvedValue({
      id: userId,
      email: 'ava@taskflow.app',
      name: 'Ava Updated',
      avatarUrl: 'https://cdn.taskflow.app/avatar.png',
      timezone: 'America/New_York',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-03T00:00:00.000Z'),
      notificationPreference: {
        emailMentions: false,
        emailTaskUpdates: true,
        inAppMentions: true,
        inAppTaskUpdates: false
      }
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/auth/me',
      headers: authHeaders(app),
      payload: {
        name: 'Ava Updated',
        timezone: 'America/New_York',
        avatarUrl: 'https://cdn.taskflow.app/avatar.png',
        notificationPreferences: {
          emailMentions: false,
          inAppTaskUpdates: false
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: userId },
      data: {
        name: 'Ava Updated',
        timezone: 'America/New_York',
        avatarUrl: 'https://cdn.taskflow.app/avatar.png',
        notificationPreference: {
          upsert: {
            update: {
              emailMentions: false,
              emailTaskUpdates: undefined,
              inAppMentions: undefined,
              inAppTaskUpdates: false
            },
            create: {
              emailMentions: false,
              emailTaskUpdates: true,
              inAppMentions: true,
              inAppTaskUpdates: false
            }
          }
        }
      },
      include: { notificationPreference: true }
    });

    const body = response.json();
    expect(body.user.name).toBe('Ava Updated');
    expect(body.user.notificationPreferences.inAppTaskUpdates).toBe(false);
  });
});
