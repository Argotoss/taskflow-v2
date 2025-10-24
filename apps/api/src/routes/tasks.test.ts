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
  description: 'Details',
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
      buildProjectAccess({ id: projectId, workspaceId, ownerId: userId }) as unknown as Awaited<
        ReturnType<typeof app.prisma.project.findUnique>
      >
    );
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({ id: 'mem', workspaceId, userId, role: 'OWNER' }) as unknown as Awaited<
        ReturnType<typeof app.prisma.membership.findFirst>
      >
    );
  };

  it('lists project tasks', async () => {
    mockProjectAccess();
    vi.spyOn(app.prisma.task, 'findMany').mockResolvedValue([taskRecord] as unknown as Awaited<
      ReturnType<typeof app.prisma.task.findMany>
    >);
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
    vi.spyOn(app.prisma.task, 'aggregate').mockResolvedValue(
      { _max: { sortOrder: null } } as unknown as Awaited<ReturnType<typeof app.prisma.task.aggregate>>
    );
    vi.spyOn(app.prisma.task, 'create').mockResolvedValue(
      taskRecord as unknown as Awaited<ReturnType<typeof app.prisma.task.create>>
    );

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
    vi.spyOn(app.prisma.task, 'findUnique').mockResolvedValue(
      { ...taskRecord } as unknown as Awaited<ReturnType<typeof app.prisma.task.findUnique>>
    );
    vi.spyOn(app.prisma.task, 'update').mockResolvedValue(
      { ...taskRecord, title: 'Updated' } as unknown as Awaited<ReturnType<typeof app.prisma.task.update>>
    );

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
    vi.spyOn(app.prisma.task, 'findMany').mockResolvedValue(
      [{ id: taskRecord.id }] as unknown as Awaited<ReturnType<typeof app.prisma.task.findMany>>
    );
    vi.spyOn(app.prisma.task, 'updateMany').mockResolvedValue(
      { count: 1 } as unknown as Awaited<ReturnType<typeof app.prisma.task.updateMany>>
    );
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
        columns: [
          {
            status: 'TODO',
            taskIds: [taskRecord.id]
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
  });

  it('deletes a task', async () => {
    mockProjectAccess();
    vi.spyOn(app.prisma.task, 'findUnique').mockResolvedValue(
      { id: taskRecord.id, projectId } as unknown as Awaited<ReturnType<typeof app.prisma.task.findUnique>>
    );
    const deleteChecklistSpy = vi
      .spyOn(app.prisma.taskChecklistItem, 'deleteMany')
      .mockResolvedValue({ count: 2 } as unknown as Awaited<ReturnType<typeof app.prisma.taskChecklistItem.deleteMany>>);
    const deleteCommentsSpy = vi
      .spyOn(app.prisma.comment, 'deleteMany')
      .mockResolvedValue({ count: 2 } as unknown as Awaited<ReturnType<typeof app.prisma.comment.deleteMany>>);
    const deleteAttachmentsSpy = vi
      .spyOn(app.prisma.attachment, 'deleteMany')
      .mockResolvedValue({ count: 1 } as unknown as Awaited<ReturnType<typeof app.prisma.attachment.deleteMany>>);
    const deleteTaskSpy = vi
      .spyOn(app.prisma.task, 'delete')
      .mockResolvedValue(taskRecord as unknown as Awaited<ReturnType<typeof app.prisma.task.delete>>);
    vi.spyOn(app.prisma, '$transaction').mockImplementation(async (operations) => {
      if (Array.isArray(operations)) {
        for (const operation of operations) {
          await operation;
        }
      }
      return [] as unknown as Awaited<ReturnType<typeof app.prisma.$transaction>>;
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/tasks/${taskRecord.id}`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(204);
    expect(deleteChecklistSpy).toHaveBeenCalledWith({ where: { taskId: taskRecord.id } });
    expect(deleteCommentsSpy).toHaveBeenCalledWith({ where: { taskId: taskRecord.id } });
    expect(deleteAttachmentsSpy).toHaveBeenCalledWith({ where: { taskId: taskRecord.id } });
    expect(deleteTaskSpy).toHaveBeenCalledWith({ where: { id: taskRecord.id } });
  });
});
