import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { buildNotification } from '../testing/builders.js';

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const authHeaders = (appInstance: ReturnType<typeof buildApp>): { authorization: string } => ({
  authorization: `Bearer ${appInstance.jwt.sign({ sub: userId, type: 'access' })}`
});

describe('notification routes', () => {
  const app = buildApp();

  beforeEach(async () => {
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists notifications for the current user', async () => {
    const notificationRecord = buildNotification({
      id: '11111111-1111-1111-1111-111111111111',
      userId,
      type: 'ONBOARDING_WELCOME',
      payload: {
        title: 'Welcome',
        description: 'Create your first workspace'
      },
      createdAt: new Date('2024-01-01T00:00:00Z'),
      readAt: null
    });

    const findManySpy = vi.spyOn(app.prisma.notification, 'findMany').mockResolvedValue(
      [notificationRecord] as unknown as Awaited<ReturnType<typeof app.prisma.notification.findMany>>
    );
    const countSpy = vi.spyOn(app.prisma.notification, 'count').mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: '/notifications?page=2&pageSize=10&unreadOnly=true',
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(findManySpy).toHaveBeenCalledWith({
      where: {
        userId,
        readAt: null
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
      select: {
        id: true,
        userId: true,
        type: true,
        payload: true,
        readAt: true,
        createdAt: true
      }
    });
    expect(countSpy).toHaveBeenCalledWith({
      where: {
        userId,
        readAt: null
      }
    });
    const body = response.json();
    expect(body.data[0].id).toBe(notificationRecord.id);
    expect(body.meta.page).toBe(2);
    expect(body.meta.totalItems).toBe(1);
  });

  it('marks a notification as read', async () => {
    const notificationRecord = buildNotification({
      id: '22222222-2222-2222-2222-222222222222',
      userId,
      type: 'WORKSPACE_JOINED',
      payload: {
        workspaceId: '33333333-3333-3333-3333-333333333333',
        workspaceName: 'Demo Workspace'
      },
      createdAt: new Date('2024-01-02T00:00:00Z'),
      readAt: null
    });

    vi.spyOn(app.prisma.notification, 'findUnique').mockResolvedValue(
      notificationRecord as unknown as Awaited<ReturnType<typeof app.prisma.notification.findUnique>>
    );
    const updateSpy = vi.spyOn(app.prisma.notification, 'update').mockResolvedValue(
      {
        ...notificationRecord,
        readAt: new Date('2024-01-03T00:00:00Z')
      } as unknown as Awaited<ReturnType<typeof app.prisma.notification.update>>
    );

    const response = await app.inject({
      method: 'POST',
      url: `/notifications/${notificationRecord.id}/read`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: notificationRecord.id },
      data: { readAt: expect.any(Date) },
      select: {
        id: true,
        userId: true,
        type: true,
        payload: true,
        readAt: true,
        createdAt: true
      }
    });
    expect(response.json().data.readAt).toBe('2024-01-03T00:00:00.000Z');
  });

  it('returns 404 when notification missing or inaccessible', async () => {
    vi.spyOn(app.prisma.notification, 'findUnique').mockResolvedValue(null);

    const response = await app.inject({
      method: 'POST',
      url: '/notifications/99999999-9999-9999-9999-999999999999/read',
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(404);
  });
});
