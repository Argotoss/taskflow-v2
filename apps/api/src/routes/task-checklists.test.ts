import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@taskflow/db';
import { buildApp } from '../app.js';
import {
  buildMembership,
  buildProjectAccess,
  buildTaskChecklistItem
} from '../testing/builders.js';

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const taskId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const workspaceId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const item1Id = '11111111-1111-1111-1111-111111111111';
const item2Id = '22222222-2222-2222-2222-222222222222';
const item3Id = '33333333-3333-3333-3333-333333333333';
const item4Id = '44444444-4444-4444-4444-444444444444';

const authHeaders = (appInstance: ReturnType<typeof buildApp>): { authorization: string } => ({
  authorization: `Bearer ${appInstance.jwt.sign({ sub: userId, type: 'access' })}`
});

describe('task checklist routes', () => {
  const app = buildApp();

  const mockTaskAccess = (): void => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue({
      id: userId,
      email: 'test@example.com',
      name: 'Test User'
    } as unknown as Awaited<ReturnType<typeof app.prisma.user.findUnique>>);
    vi.spyOn(app.prisma.task, 'findUnique').mockResolvedValue({
      id: taskId,
      projectId
    } as unknown as Awaited<ReturnType<typeof app.prisma.task.findUnique>>);
    vi.spyOn(app.prisma.project, 'findUnique').mockResolvedValue(
      buildProjectAccess({ id: projectId, workspaceId, ownerId: userId }) as unknown as Awaited<
        ReturnType<typeof app.prisma.project.findUnique>
      >
    );
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({ workspaceId, userId, role: 'OWNER' }) as unknown as Awaited<
        ReturnType<typeof app.prisma.membership.findFirst>
      >
    );
  };

  beforeEach(async () => {
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists checklist items', async () => {
    mockTaskAccess();
    const item = buildTaskChecklistItem({
      id: item1Id,
      taskId,
      position: new Prisma.Decimal(1),
      completedAt: null
    });
    vi.spyOn(app.prisma.taskChecklistItem, 'findMany').mockResolvedValue(
      [item] as unknown as Awaited<ReturnType<typeof app.prisma.taskChecklistItem.findMany>>
    );

    const response = await app.inject({
      method: 'GET',
      url: `/tasks/${taskId}/checklist`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].id).toBe(item1Id);
    expect(response.json().data[0].position).toBe(1);
  });

  it('creates a checklist item', async () => {
    mockTaskAccess();
    vi.spyOn(app.prisma.taskChecklistItem, 'aggregate').mockResolvedValue({
      _max: { position: new Prisma.Decimal(2) }
    } as unknown as Awaited<ReturnType<typeof app.prisma.taskChecklistItem.aggregate>>);
    const created = buildTaskChecklistItem({
      id: item2Id,
      taskId,
      position: new Prisma.Decimal(3),
      label: 'Write tests'
    });
    const createSpy = vi.spyOn(app.prisma.taskChecklistItem, 'create').mockResolvedValue(
      created as unknown as Awaited<ReturnType<typeof app.prisma.taskChecklistItem.create>>
    );

    const response = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/checklist`,
      headers: authHeaders(app),
      payload: {
        label: 'Write tests'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(createSpy).toHaveBeenCalled();
    expect(response.json().data.label).toBe('Write tests');
    expect(response.json().data.position).toBe(3);
  });

  it('updates a checklist item', async () => {
    mockTaskAccess();
    vi.spyOn(app.prisma.taskChecklistItem, 'findUnique').mockResolvedValue({
      id: item3Id,
      taskId
    } as unknown as Awaited<ReturnType<typeof app.prisma.taskChecklistItem.findUnique>>);
    const updated = buildTaskChecklistItem({
      id: item3Id,
      taskId,
      label: 'Refine copy',
      completedAt: new Date('2024-01-01T00:00:00Z')
    });
    const updateSpy = vi.spyOn(app.prisma.taskChecklistItem, 'update').mockResolvedValue(
      updated as unknown as Awaited<ReturnType<typeof app.prisma.taskChecklistItem.update>>
    );

    const response = await app.inject({
      method: 'PATCH',
      url: `/tasks/${taskId}/checklist/${item3Id}`,
      headers: authHeaders(app),
      payload: {
        label: 'Refine copy',
        completed: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: item3Id },
      data: {
        label: 'Refine copy',
        completedAt: expect.any(Date)
      },
      select: expect.any(Object)
    });
    expect(response.json().data.completedAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('deletes a checklist item', async () => {
    mockTaskAccess();
    vi.spyOn(app.prisma.taskChecklistItem, 'findUnique').mockResolvedValue({
      id: item4Id,
      taskId
    } as unknown as Awaited<ReturnType<typeof app.prisma.taskChecklistItem.findUnique>>);
    const deleteSpy = vi.spyOn(app.prisma.taskChecklistItem, 'delete').mockResolvedValue(
      buildTaskChecklistItem({ id: item4Id, taskId }) as unknown as Awaited<ReturnType<typeof app.prisma.taskChecklistItem.delete>>
    );

    const response = await app.inject({
      method: 'DELETE',
      url: `/tasks/${taskId}/checklist/${item4Id}`,
      headers: authHeaders(app)
    });

    expect(response.statusCode).toBe(204);
    expect(deleteSpy).toHaveBeenCalledWith({ where: { id: item4Id } });
  });
});
