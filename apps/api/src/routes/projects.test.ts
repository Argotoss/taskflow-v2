import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import { buildMembership, buildProject } from '../testing/builders.js';

const userId = '22222222-2222-2222-2222-222222222222';
const workspaceId = '11111111-1111-1111-1111-111111111111';

const projectRecord = buildProject({
  id: '33333333-3333-3333-3333-333333333333',
  workspaceId,
  ownerId: userId,
  name: 'Team Portal',
  key: 'PORTAL',
  description: 'Internal portal',
  createdAt: new Date('2024-01-05T00:00:00.000Z'),
  updatedAt: new Date('2024-01-05T00:00:00.000Z')
});

describe('project routes', () => {
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

  it('lists projects in a workspace', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({ id: 'mem', workspaceId, userId, role: 'OWNER' })
    );
    vi.spyOn(app.prisma.project, 'findMany').mockResolvedValue([projectRecord]);
    vi.spyOn(app.prisma.project, 'count').mockResolvedValue(1);

    const response = await app.inject({
      method: 'GET',
      url: `/workspaces/${workspaceId}/projects`,
      headers: authHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data[0]).toMatchObject({ id: projectRecord.id, key: projectRecord.key });
  });

  it('creates a project', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValueOnce(
      buildMembership({ id: 'mem', workspaceId, userId, role: 'OWNER' })
    );
    vi.spyOn(app.prisma.project, 'findFirst').mockResolvedValue(null);
    vi.spyOn(app.prisma.project, 'create').mockResolvedValue(projectRecord);

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceId}/projects`,
      headers: authHeaders(),
      payload: {
        name: 'Team Portal',
        key: 'PORTAL'
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.name).toBe('Team Portal');
  });

  it('rejects duplicate project keys', async () => {
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({ id: 'mem', workspaceId, userId, role: 'OWNER' })
    );
    vi.spyOn(app.prisma.project, 'findFirst').mockResolvedValue(projectRecord);

    const response = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceId}/projects`,
      headers: authHeaders(),
      payload: {
        name: 'Team Portal',
        key: 'PORTAL'
      }
    });

    expect(response.statusCode).toBe(409);
  });

  it('updates a project', async () => {
    vi.spyOn(app.prisma.project, 'findUnique').mockResolvedValue(projectRecord);
    vi.spyOn(app.prisma.membership, 'findFirst').mockResolvedValue(
      buildMembership({ id: 'mem', workspaceId, userId, role: 'ADMIN' })
    );
    vi.spyOn(app.prisma.project, 'update').mockResolvedValue({ ...projectRecord, name: 'Portal V2' });

    const response = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectRecord.id}`,
      headers: authHeaders(),
      payload: {
        name: 'Portal V2'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.name).toBe('Portal V2');
  });

  it('returns 404 when updating missing project', async () => {
    vi.spyOn(app.prisma.project, 'findUnique').mockResolvedValue(null);

    const response = await app.inject({
      method: 'PATCH',
      url: `/projects/${projectRecord.id}`,
      headers: authHeaders(),
      payload: {
        name: 'Portal V2'
      }
    });

    expect(response.statusCode).toBe(404);
  });
});
