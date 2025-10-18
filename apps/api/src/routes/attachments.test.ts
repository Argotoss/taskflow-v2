import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { buildAttachmentWithUploader, buildMembership, buildTaskWithWorkspace } from '../testing/builders.js';

const userId = '11112222-3333-4444-5555-666677778888';
const taskId = '99990000-aaaa-bbbb-cccc-ddddeeeeffff';
const workspaceId = 'abcdef12-3456-7890-abcd-ef1234567890';

const taskStub = buildTaskWithWorkspace({
  id: taskId,
  project: {
    workspaceId
  }
});

describe('attachment routes', () => {
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

  const allowAccess = (): void => {
    vi.spyOn(app.prisma.task, 'findUnique').mockResolvedValue(
      taskStub as unknown as Awaited<ReturnType<typeof app.prisma.task.findUnique>>
    );
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({ id: 'mem', workspaceId, userId, role: 'OWNER' }) as unknown as Awaited<
        ReturnType<typeof app.prisma.membership.findFirst>
      >
    );
  };

  it('returns a presigned upload payload', async () => {
    allowAccess();
    const response = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/attachments/presign`,
      headers: authHeaders(),
      payload: {
        fileName: 'design.pdf',
        fileSize: 1024,
        contentType: 'application/pdf'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.storageKey).toContain(taskId);
    expect(body.uploadUrl).toContain('s3');
  });

  it('persists attachment metadata', async () => {
    allowAccess();
    vi.spyOn(app.prisma.attachment, 'create').mockResolvedValue(
      buildAttachmentWithUploader({
        id: '11111111-2222-3333-4444-555555555555',
        taskId,
        uploaderId: userId,
        fileName: 'design.pdf',
        fileSize: 1024,
        contentType: 'application/pdf',
        storageKey: 'attachments/key',
        uploader: {
          id: userId,
          email: 'owner@taskflow.app',
          name: 'Owner',
          avatarUrl: null
        }
      }) as unknown as Awaited<ReturnType<typeof app.prisma.attachment.create>>
    );

    const response = await app.inject({
      method: 'POST',
      url: `/tasks/${taskId}/attachments`,
      headers: authHeaders(),
      payload: {
        fileName: 'design.pdf',
        fileSize: 1024,
        contentType: 'application/pdf',
        storageKey: 'attachments/key'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.fileName).toBe('design.pdf');
  });

  it('lists attachments for a task', async () => {
    allowAccess();
    vi.spyOn(app.prisma.attachment, 'findMany').mockResolvedValue([
      buildAttachmentWithUploader({
        id: '11111111-2222-3333-4444-555555555555',
        taskId,
        uploaderId: userId,
        fileName: 'design.pdf',
        fileSize: 1024,
        contentType: 'application/pdf',
        storageKey: 'attachments/key',
        uploader: {
          id: userId,
          email: 'owner@taskflow.app',
          name: 'Owner',
          avatarUrl: null
        }
      })
    ] as unknown as Awaited<ReturnType<typeof app.prisma.attachment.findMany>>);

    const response = await app.inject({
      method: 'GET',
      url: `/tasks/${taskId}/attachments`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0].fileName).toBe('design.pdf');
  });
});
