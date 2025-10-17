import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@taskflow/db';
import { buildApp } from '../app.js';
import { buildMembership, buildProjectAccess, buildTaskSummary } from '../testing/builders.js';

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const projectId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const workspaceId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const taskRecord = buildTaskSummary({
  id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  projectId,
  creatorId: userId,
  assigneeId: userId,
  title: 'Design spec',
  status: 'TODO',
  priority: 'HIGH',
  sortOrder: new Prisma.Decimal(1),
  dueDate: new Date('2024-02-01T00:00:00.000Z'),
  createdAt: new Date('2024-01-10T00:00:00.000Z'),
  updatedAt: new Date('2024-01-10T00:00:00.000Z')
});

describe('task routes', () => {
  const app = buildApp();
  const authHeaders = (): { authorization: string } => ({
    authorization: `Bearer ${app.jwt.sign({ sub: userId, type: 'access' })}`
  });

  beforeEach(async () => {
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockProjectAccess = (): void => {
    vi.spyOn(app.prisma.project, 'findUnique').mockResolvedValue(
      buildProjectAccess({ id: projectId, workspaceId, ownerId: userId })
    );
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({ id: 'mem', workspaceId, userId, role: 'OWNER' })
    );
  };

  it('lists project tasks', async () => {
    mockProjectAccess();
    vi.spyOn(app.prisma.task, 'findMany').mockResolvedValue([taskRecord]);
    vi.spyOn(app.prisma.task, 'count').mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}/tasks`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({ id: taskRecord.id, title: taskRecord.title });
  });

  it('creates a task', async () => {
    mockProjectAccess();
    vi.spyOn(app.prisma.task, 'create').mockResolvedValue(taskRecord);

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/tasks`,
      headers: authHeaders(),
      payload: {
        title: 'Design spec'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.title).toBe('Design spec');
  });

  it('updates a task', async () => {
    mockProjectAccess();
    vi.spyOn(app.prisma.task, 'findUnique').mockResolvedValue({ ...taskRecord });
    vi.spyOn(app.prisma.task, 'update').mockResolvedValue({ ...taskRecord, title: 'Updated' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/tasks/${taskRecord.id}`,
      headers: authHeaders(),
      payload: {
        title: 'Updated'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.title).toBe('Updated');
  });

  it('reorders tasks', async () => {
    mockProjectAccess();
    vi.spyOn(app.prisma.task, 'update').mockResolvedValue(taskRecord);
    vi.spyOn(app.prisma, '$transaction').mockImplementation(async (operations) => {
      if (Array.isArray(operations)) {
        await Promise.all(operations as Promise<unknown>[]);
      }
      return [] as unknown as ReturnType<typeof app.prisma.$transaction>;
    });

    const response = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/tasks/reorder`,
      headers: authHeaders(),
      payload: {
        taskIds: [taskRecord.id]
      }
    });

    expect(response.statusCode).toBe(200);
  });
});
