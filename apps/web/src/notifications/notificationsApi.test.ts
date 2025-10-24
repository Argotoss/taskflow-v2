import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationSummary } from '@taskflow/types';
import { notificationsApi } from './notificationsApi.js';
import { ApiError } from '../api/httpClient.js';

const buildFetchResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });

describe('notificationsApi', () => {
  const accessToken = 'access-token';

  const fetchMock = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists notifications', async () => {
    const data: NotificationSummary[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        type: 'ONBOARDING_WELCOME',
        payload: { title: 'Welcome' },
        readAt: null,
        createdAt: new Date('2024-01-01T00:00:00Z').toISOString()
      }
    ];
    fetchMock().mockResolvedValue(
      buildFetchResponse({ data, meta: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 } })
    );

    const response = await notificationsApi.list(accessToken, { unreadOnly: true, page: 2, pageSize: 25 });

    expect(response).toEqual(data);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/notifications?page=2&pageSize=25&unreadOnly=true',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('marks notification as read', async () => {
    const notification: NotificationSummary = {
      id: '22222222-2222-2222-2222-222222222222',
      userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      type: 'WORKSPACE_JOINED',
      payload: { workspaceId: '33333333-3333-3333-3333-333333333333' },
      readAt: new Date('2024-01-03T00:00:00Z').toISOString(),
      createdAt: new Date('2024-01-02T00:00:00Z').toISOString()
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: notification }));

    const response = await notificationsApi.markRead(accessToken, notification.id);

    expect(response).toEqual(notification);
    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3000/notifications/${notification.id}/read`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('requires access token', async () => {
    await expect(() => notificationsApi.list(null)).rejects.toThrow(ApiError);
  });
});
