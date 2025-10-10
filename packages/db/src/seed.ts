import type { User } from '@prisma/client';
import { prisma } from './index.js';

const passwordHash = '$argon2id$v=19$m=65536,t=3,p=1$Wm5wM3pWbXlYVnRNRklnbw$3Wr9PXgC7cmk6VwBEm90LrHUoQwoMvVJE9idh+NEnkk';

const wipe = async (): Promise<void> => {
  await prisma.$transaction([
    prisma.activity.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.task.deleteMany(),
    prisma.project.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.workspaceInvite.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.authToken.deleteMany(),
    prisma.user.deleteMany()
  ]);
};

const createUsers = async (): Promise<{ owner: User; teammate: User; viewer: User }> => {
  const owner = await prisma.user.create({
    data: {
      email: 'ava.stewart@taskflow.app',
      passwordHash,
      name: 'Ava Stewart',
      avatarUrl: null,
      timezone: 'America/New_York'
    }
  });

  const teammate = await prisma.user.create({
    data: {
      email: 'liam.turner@taskflow.app',
      passwordHash,
      name: 'Liam Turner',
      avatarUrl: null,
      timezone: 'America/Los_Angeles'
    }
  });

  const viewer = await prisma.user.create({
    data: {
      email: 'mia.chen@taskflow.app',
      passwordHash,
      name: 'Mia Chen',
      avatarUrl: null,
      timezone: 'Europe/London'
    }
  });

  return { owner, teammate, viewer };
};

const createWorkspaceGraph = async (ownerId: string, teammateId: string, viewerId: string): Promise<void> => {
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Taskflow Demo',
      slug: 'taskflow-demo',
      description: 'Demonstration workspace showcasing Taskflow features.',
      ownerId
    }
  });

  await prisma.membership.createMany({
    data: [
      { workspaceId: workspace.id, userId: ownerId, role: 'OWNER' },
      { workspaceId: workspace.id, userId: teammateId, role: 'CONTRIBUTOR' },
      { workspaceId: workspace.id, userId: viewerId, role: 'VIEWER' }
    ]
  });

  const discoveryProject = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      ownerId,
      name: 'Discovery & Planning',
      key: 'DISC',
      description: 'Initial work to shape backlog and delivery milestones.'
    }
  });

  const deliveryProject = await prisma.project.create({
    data: {
      workspaceId: workspace.id,
      ownerId,
      name: 'Delivery Sprint 1',
      key: 'SPR1',
      description: 'First sprint focused on task board and notifications.'
    }
  });

  const backlog = await prisma.task.create({
    data: {
      projectId: discoveryProject.id,
      creatorId: ownerId,
      assigneeId: teammateId,
      title: 'Draft product requirements',
      description: 'Capture personas, goals, and acceptance criteria in the PRD.',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      sortOrder: 1,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    }
  });

  await prisma.task.create({
    data: {
      projectId: discoveryProject.id,
      creatorId: ownerId,
      assigneeId: ownerId,
      title: 'Confirm architecture diagram',
      description: 'Validate service boundaries, queues, and observability strategy.',
      priority: 'MEDIUM',
      status: 'TODO',
      sortOrder: 2
    }
  });

  const boardUi = await prisma.task.create({
    data: {
      projectId: deliveryProject.id,
      creatorId: ownerId,
      assigneeId: teammateId,
      title: 'Build kanban board UI',
      description: 'Implement drag & drop columns, task cards, and quick actions.',
      priority: 'HIGH',
      status: 'TODO',
      sortOrder: 1
    }
  });

  await prisma.task.create({
    data: {
      projectId: deliveryProject.id,
      creatorId: ownerId,
      assigneeId: null,
      title: 'Schedule daily digest job',
      description: 'Send summary emails to each workspace with overdue tasks.',
      priority: 'MEDIUM',
      status: 'TODO',
      sortOrder: 2
    }
  });

  await prisma.comment.createMany({
    data: [
      {
        taskId: backlog.id,
        authorId: ownerId,
        body: 'Please reference the competitive analysis doc when drafting requirements.'
      },
      {
        taskId: backlog.id,
        authorId: teammateId,
        body: 'Will do. I will attach the synthesis slides once ready.'
      },
      {
        taskId: boardUi.id,
        authorId: ownerId,
        body: 'Let us reuse the component library tokens for spacing and colors.'
      }
    ]
  });

  await prisma.attachment.create({
    data: {
      taskId: backlog.id,
      uploaderId: teammateId,
      fileName: 'competitive-analysis.pdf',
      fileSize: 482139,
      contentType: 'application/pdf',
      storageKey: 'attachments/demo/competitive-analysis.pdf'
    }
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: teammateId,
        type: 'TASK_ASSIGNED',
        payload: { taskId: boardUi.id, projectId: deliveryProject.id },
        readAt: null
      },
      {
        userId: viewerId,
        type: 'TASK_COMMENTED',
        payload: { taskId: backlog.id, projectId: discoveryProject.id },
        readAt: new Date()
      }
    ]
  });

  await prisma.activity.createMany({
    data: [
      {
        workspaceId: workspace.id,
        actorId: ownerId,
        entityType: 'WORKSPACE',
        entityId: workspace.id,
        action: 'CREATED',
        metadata: { name: workspace.name }
      },
      {
        workspaceId: workspace.id,
        actorId: ownerId,
        entityType: 'TASK',
        entityId: backlog.id,
        action: 'CREATED',
        metadata: { title: backlog.title }
      },
      {
        workspaceId: workspace.id,
        actorId: teammateId,
        entityType: 'COMMENT',
        entityId: backlog.id,
        action: 'COMMENTED',
        metadata: { excerpt: 'Will do.' }
      }
    ]
  });
};

const main = async (): Promise<void> => {
  await wipe();
  const { owner, teammate, viewer } = await createUsers();
  await createWorkspaceGraph(owner.id, teammate.id, viewer.id);
};

main()
  .then(() => {
    process.stdout.write('Database seeded with demo workspace.\n');
    return prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seeding failed', error);
    await prisma.$disconnect();
    process.exit(1);
  });
