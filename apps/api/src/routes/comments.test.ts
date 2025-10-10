import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';

const userId = 'abababab-abab-abab-abab-abababababab';
const taskId = 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd';
const workspaceId = 'efefefef-efef-efef-efef-efefefefefef';

const taskStub = {
  id: taskId,
  project: {
    workspaceId
  }
} as const;

describe('comment routes', () => {
  const app = buildApp();

  beforeEach(async () => {
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const allowAccess = (): void => {
    vi.spyOn(app.prisma.task, 'findUnique').mockResolvedValue(taskStub as unknown as Awaited<ReturnType<typeof app.prisma.task.findUnique>>);
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue({
      id: 'mem',
      workspaceId,
      userId,
      role: 'OWNER',
      createdAt: new Date(),
      updatedAt: new Date()
    } as unknown as Awaited<ReturnType<typeof app.prisma.membership.findFirst>>);
  };

  it('lists comments for a task', async () => {
    allowAccess();
    vi.spyOn(app.prisma.comment, 'findMany').mockResolvedValue([
      {
        id: '77777777-7777-7777-7777-777777777777',
        taskId,
        authorId: userId,
        body: 'Looks good to me',
        createdAt: new Date('2024-01-12T00:00:00.000Z'),
        updatedAt: new Date('2024-01-12T00:00:00.000Z'),
        author: {
          id: userId,
          email: 'owner@taskflow.app',
          name: 'Owner',
          avatarUrl: null
        }
      }
    ] as unknown as Awaited<ReturnType<typeof app.prisma.comment.findMany>>);
    vi.spyOn(app.prisma.comment, 'count').mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: `/tasks/${taskId}/comments`,
      headers: { 'x-user-id': userId }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].body).toContain('Looks good');
  });

  it('creates a comment', async () => {
    allowAccess();
    vi.spyOn(app.prisma.comment, 'create').mockResolvedValue({
      id: '77777777-7777-7777-7777-777777777777',
      taskId,
      authorId: userId,
      body: 'Ship it',
      createdAt: new Date(),
      updatedAt: new Date(),
      author: {
        id: userId,
        email: 'owner@taskflow.app',
        name: 'Owner',
        avatarUrl: null
      }
    } as unknown as Awaited<ReturnType<typeof app.prisma.comment.create>>);

    const response = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/comments`,
      headers: { 'x-user-id': userId },
      payload: {
        body: 'Ship it'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.body).toBe('Ship it');
  });
});
