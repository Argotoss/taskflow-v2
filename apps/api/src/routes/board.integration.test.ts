import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { createInMemoryPrisma } from '../testing/inMemoryPrisma.js';
import { buildUser, buildWorkspace, buildMembership } from '../testing/builders.js';

const ownerId = '11111111-2222-3333-4444-555555555555';
const ownerEmail = 'owner@taskflow.app';
const workspaceId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

const authHeaders = (app: FastifyInstance, userId: string): { authorization: string } => ({
  authorization: `Bearer ${app.jwt.sign({ sub: userId, type: 'access' })}`
});

describe('board lifecycle', () => {
  let app: FastifyInstance;
  const prisma = createInMemoryPrisma();

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(async () => {
    prisma.reset();
    await app.ready();
    prisma.apply(app);
  });

  afterEach(() => {
    prisma.restore();
  });

  afterAll(async () => {
    await app.close();
  });

  it('supports workspace bootstrapping, project setup, and task board interactions', async () => {
    prisma.upsertUser(
      buildUser({
        id: ownerId,
        email: ownerEmail,
        name: 'Owner'
      })
    );

    const emptyResponse = await app.inject({
      method: 'GET',
      url: '/workspaces',
      headers: authHeaders(app, ownerId)
    });
    expect(emptyResponse.statusCode).toBe(200);
    expect(emptyResponse.json().data).toHaveLength(0);

    const createWorkspace = await app.inject({
      method: 'POST',
      url: '/workspaces',
      headers: authHeaders(app, ownerId),
      payload: {
        name: 'Portfolio Workspace',
        slug: 'portfolio-workspace',
        description: 'Team collaboration'
      }
    });
    expect(createWorkspace.statusCode).toBe(201);
    const createdWorkspace = createWorkspace.json().data;
    expect(createdWorkspace.name).toBe('Portfolio Workspace');

    const listAfterCreate = await app.inject({
      method: 'GET',
      url: '/workspaces',
      headers: authHeaders(app, ownerId)
    });
    expect(listAfterCreate.statusCode).toBe(200);
    expect(listAfterCreate.json().data[0].id).toBe(createdWorkspace.id);

    const createProject = await app.inject({
      method: 'POST',
      url: `/workspaces/${createdWorkspace.id}/projects`,
      headers: authHeaders(app, ownerId),
      payload: {
        name: 'Launch Board',
        key: 'LCH',
        description: 'Launch preparation'
      }
    });
    expect(createProject.statusCode).toBe(201);
    const project = createProject.json().data;

    const projectList = await app.inject({
      method: 'GET',
      url: `/workspaces/${createdWorkspace.id}/projects`,
      headers: authHeaders(app, ownerId)
    });
    expect(projectList.statusCode).toBe(200);
    expect(projectList.json().data[0].id).toBe(project.id);

    const firstTaskResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/tasks`,
      headers: authHeaders(app, ownerId),
      payload: {
        title: 'Outline requirements',
        description: 'Gather feature requirements',
        status: 'TODO'
      }
    });
    expect(firstTaskResponse.statusCode).toBe(201);
    const firstTask = firstTaskResponse.json().data;

    const secondTaskResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/tasks`,
      headers: authHeaders(app, ownerId),
      payload: {
        title: 'Design prototype',
        status: 'IN_PROGRESS'
      }
    });
    expect(secondTaskResponse.statusCode).toBe(201);
    const secondTask = secondTaskResponse.json().data;

    const thirdTaskResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/tasks`,
      headers: authHeaders(app, ownerId),
      payload: {
        title: 'QA checklist',
        status: 'TODO'
      }
    });
    expect(thirdTaskResponse.statusCode).toBe(201);
    const thirdTask = thirdTaskResponse.json().data;

    const reorderResponse = await app.inject({
      method: 'POST',
      url: `/projects/${project.id}/tasks/reorder`,
      headers: authHeaders(app, ownerId),
      payload: {
        columns: [
          { status: 'TODO', taskIds: [thirdTask.id] },
          { status: 'IN_PROGRESS', taskIds: [] },
          { status: 'IN_REVIEW', taskIds: [secondTask.id] },
          { status: 'BLOCKED', taskIds: [] },
          { status: 'COMPLETED', taskIds: [firstTask.id] }
        ]
      }
    });
    expect(reorderResponse.statusCode).toBe(200);

    const updateTask = await app.inject({
      method: 'PATCH',
      url: `/tasks/${secondTask.id}`,
      headers: authHeaders(app, ownerId),
      payload: {
        description: 'Interactive Figma prototype',
        status: 'IN_REVIEW'
      }
    });
    expect(updateTask.statusCode).toBe(200);
    expect(updateTask.json().data.status).toBe('IN_REVIEW');

    const deleteTask = await app.inject({
      method: 'DELETE',
      url: `/tasks/${thirdTask.id}`,
      headers: authHeaders(app, ownerId)
    });
    expect(deleteTask.statusCode).toBe(204);

    const listTasks = await app.inject({
      method: 'GET',
      url: `/projects/${project.id}/tasks`,
      headers: authHeaders(app, ownerId)
    });
    expect(listTasks.statusCode).toBe(200);
    const tasks = listTasks.json().data;
    expect(tasks).toHaveLength(2);
    const completed = tasks.find((item: { id: string }) => item.id === firstTask.id);
    const review = tasks.find((item: { id: string }) => item.id === secondTask.id);
    expect(completed.status).toBe('COMPLETED');
    expect(review.status).toBe('IN_REVIEW');
    const sortOrders = tasks.map((item: { sortOrder: number }) => item.sortOrder);
    const orderedSort = [...sortOrders].sort((left, right) => left - right);
    expect(sortOrders).toEqual(orderedSort);
    expect(new Set(sortOrders).size).toBe(sortOrders.length);
  });

  it('handles end-to-end invitation flow for new members', async () => {
    prisma.upsertUser(
      buildUser({
        id: ownerId,
        email: ownerEmail,
        name: 'Owner'
      })
    );
    prisma.upsertWorkspace(
      buildWorkspace({
        id: workspaceId,
        ownerId,
        name: 'Design Org',
        slug: 'design-org',
        description: 'Design team workspace'
      })
    );
    prisma.upsertMembership(
      buildMembership({
        id: '44444444-5555-6666-7777-888888888888',
        workspaceId,
        userId: ownerId,
        role: 'OWNER'
      })
    );

    const inviteResponse = await app.inject({
      method: 'POST',
      url: `/workspaces/${workspaceId}/invite`,
      headers: authHeaders(app, ownerId),
      payload: {
        email: 'new.member@taskflow.app',
        role: 'CONTRIBUTOR'
      }
    });
    expect(inviteResponse.statusCode).toBe(200);
    const inviteToken = inviteResponse.json().data.token;

    const inviteList = await app.inject({
      method: 'GET',
      url: `/workspaces/${workspaceId}/invites`,
      headers: authHeaders(app, ownerId)
    });
    expect(inviteList.statusCode).toBe(200);
    expect(inviteList.json().data).toHaveLength(1);

    const invitePreview = await app.inject({
      method: 'GET',
      url: `/auth/invite/${inviteToken}`
    });
    expect(invitePreview.statusCode).toBe(200);
    expect(invitePreview.json().data.invitedEmail).toBe('new.member@taskflow.app');

    const acceptanceResponse = await app.inject({
      method: 'POST',
      url: '/auth/invite/accept',
      payload: {
        token: inviteToken,
        name: 'New Member',
        password: 'Password!123'
      }
    });
    expect(acceptanceResponse.statusCode).toBe(201);
    expect(acceptanceResponse.json().user.email).toBe('new.member@taskflow.app');
    expect(acceptanceResponse.json().tokens.refreshToken.length).toBeGreaterThan(10);

    const membersResponse = await app.inject({
      method: 'GET',
      url: `/workspaces/${workspaceId}/members`,
      headers: authHeaders(app, ownerId)
    });
    expect(membersResponse.statusCode).toBe(200);
    const members = membersResponse.json().data;
    expect(members).toHaveLength(2);
    expect(members.some((member: { user: { email: string } }) => member.user.email === 'new.member@taskflow.app')).toBe(
      true
    );

    const secondAcceptance = await app.inject({
      method: 'POST',
      url: '/auth/invite/accept',
      payload: {
        token: inviteToken,
        name: 'Duplicate',
        password: 'Password!123'
      }
    });
    expect(secondAcceptance.statusCode).toBe(404);
  });
});
