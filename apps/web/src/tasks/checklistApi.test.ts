import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskChecklistItem } from '@taskflow/types';
import { checklistApi } from './checklistApi.js';
import { ApiError } from '../api/httpClient.js';

const buildFetchResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });

describe('checklistApi', () => {
  const accessToken = 'access-token';
  const fetchMock = (): ReturnType<typeof vi.fn> => fetch as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists checklist items', async () => {
    const data: TaskChecklistItem[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        taskId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        label: 'Set up project',
        position: 1,
        completedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];
    fetchMock().mockResolvedValue(buildFetchResponse({ data }));

    const response = await checklistApi.list(accessToken, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

    expect(response).toEqual(data);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/tasks/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/checklist',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('creates checklist item', async () => {
    const item: TaskChecklistItem = {
      id: '22222222-2222-2222-2222-222222222222',
      taskId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      label: 'Write docs',
      position: 2,
      completedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: item }));

    const response = await checklistApi.create(accessToken, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Write docs');

    expect(response).toEqual(item);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/tasks/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/checklist',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates checklist item', async () => {
    const item: TaskChecklistItem = {
      id: '33333333-3333-3333-3333-333333333333',
      taskId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      label: 'Review copy',
      position: 3,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fetchMock().mockResolvedValue(buildFetchResponse({ data: item }));

    const response = await checklistApi.update(accessToken, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', { completed: true });

    expect(response).toEqual(item);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/tasks/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/checklist/33333333-3333-3333-3333-333333333333',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('requires access token', async () => {
    await expect(() => checklistApi.list(null, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).rejects.toThrow(ApiError);
  });
});
