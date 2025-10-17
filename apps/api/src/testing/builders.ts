import { Prisma } from '@taskflow/db';

const timestamp = (value = '2024-01-01T00:00:00.000Z'): Date => new Date(value);

export type NotificationPreferenceRecord = Prisma.NotificationPreference;
export type UserRecord = Prisma.User;
export type UserWithPreferences = Prisma.UserGetPayload<{ include: { notificationPreference: true } }>;
export type WorkspaceRecord = Prisma.Workspace;
export type MembershipRecord = Prisma.Membership;
export type MembershipWithUser = Prisma.MembershipGetPayload<{ include: { user: true } }>;
export type ProjectRecord = Prisma.Project;
export type ProjectAccessRecord = Prisma.ProjectGetPayload<{ select: { id: true; workspaceId: true; ownerId: true } }>;
export type MembershipWorkspaceSummary = Prisma.MembershipGetPayload<{
  select: {
    workspace: {
      select: {
        id: true;
        ownerId: true;
        name: true;
        slug: true;
        description: true;
        createdAt: true;
        updatedAt: true;
      };
    };
  };
}>;
export type TaskSummaryRecord = Prisma.TaskGetPayload<{
  select: {
    id: true;
    projectId: true;
    creatorId: true;
    assigneeId: true;
    title: true;
    status: true;
    priority: true;
    sortOrder: true;
    dueDate: true;
    createdAt: true;
    updatedAt: true;
  };
}>;
export type TaskWithWorkspace = Prisma.TaskGetPayload<{ select: { id: true; project: { select: { workspaceId: true } } } }>;
export type AttachmentWithUploader = Prisma.AttachmentGetPayload<{
  select: {
    id: true;
    taskId: true;
    uploaderId: true;
    fileName: true;
    fileSize: true;
    contentType: true;
    storageKey: true;
    createdAt: true;
    uploader: {
      select: {
        id: true;
        email: true;
        name: true;
        avatarUrl: true;
      };
    };
  };
}>;
export type CommentWithAuthor = Prisma.CommentGetPayload<{
  select: {
    id: true;
    taskId: true;
    authorId: true;
    body: true;
    createdAt: true;
    updatedAt: true;
    author: {
      select: {
        id: true;
        email: true;
        name: true;
        avatarUrl: true;
      };
    };
  };
}>;
export type WorkspaceInviteRecord = Prisma.WorkspaceInvite;

export const buildNotificationPreference = (
  overrides: Partial<NotificationPreferenceRecord> = {}
): NotificationPreferenceRecord => ({
  id: overrides.id ?? 'pref-00000000-0000-0000-0000-000000000000',
  userId: overrides.userId ?? '00000000-0000-0000-0000-000000000000',
  emailMentions: overrides.emailMentions ?? true,
  emailTaskUpdates: overrides.emailTaskUpdates ?? true,
  inAppMentions: overrides.inAppMentions ?? true,
  inAppTaskUpdates: overrides.inAppTaskUpdates ?? true,
  createdAt: overrides.createdAt ?? timestamp(),
  updatedAt: overrides.updatedAt ?? timestamp()
});

export const buildUser = (overrides: Partial<UserRecord> = {}): UserRecord => ({
  id: overrides.id ?? '00000000-0000-0000-0000-000000000000',
  email: overrides.email ?? 'user@taskflow.app',
  passwordHash: overrides.passwordHash ?? 'hash',
  name: overrides.name ?? 'Demo User',
  avatarUrl: Object.prototype.hasOwnProperty.call(overrides, 'avatarUrl') ? overrides.avatarUrl ?? null : null,
  timezone: Object.prototype.hasOwnProperty.call(overrides, 'timezone') ? overrides.timezone ?? null : null,
  createdAt: overrides.createdAt ?? timestamp(),
  updatedAt: overrides.updatedAt ?? timestamp()
});

export const buildUserWithPreferences = (
  overrides: Partial<UserWithPreferences> = {}
): UserWithPreferences => {
  const user = buildUser({
    id: overrides.id,
    email: overrides.email,
    passwordHash: overrides.passwordHash,
    name: overrides.name,
    avatarUrl: overrides.avatarUrl,
    timezone: overrides.timezone,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt
  });

  const preference =
    Object.prototype.hasOwnProperty.call(overrides, 'notificationPreference') ?
      overrides.notificationPreference ?? null :
      buildNotificationPreference({ userId: user.id });

  return {
    ...user,
    notificationPreference: preference
  };
};

export const buildWorkspace = (overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord => ({
  id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
  ownerId: overrides.ownerId ?? '00000000-0000-0000-0000-000000000000',
  name: overrides.name ?? 'Demo Workspace',
  slug: overrides.slug ?? 'demo-workspace',
  description: Object.prototype.hasOwnProperty.call(overrides, 'description') ? overrides.description ?? null : 'Demo workspace',
  createdAt: overrides.createdAt ?? timestamp(),
  updatedAt: overrides.updatedAt ?? timestamp()
});

export const buildMembership = (overrides: Partial<MembershipRecord> = {}): MembershipRecord => ({
  id: overrides.id ?? 'mem-00000000-0000-0000-0000-000000000000',
  workspaceId: overrides.workspaceId ?? '11111111-1111-1111-1111-111111111111',
  userId: overrides.userId ?? '00000000-0000-0000-0000-000000000000',
  role: overrides.role ?? 'OWNER',
  createdAt: overrides.createdAt ?? timestamp(),
  updatedAt: overrides.updatedAt ?? timestamp()
});

export const buildMembershipWithUser = (
  overrides: Partial<MembershipWithUser> = {}
): MembershipWithUser => {
  const membership = buildMembership({
    id: overrides.id,
    workspaceId: overrides.workspaceId,
    userId: overrides.userId ?? overrides.user?.id,
    role: overrides.role,
    createdAt: overrides.createdAt,
    updatedAt: overrides.updatedAt
  });

  const user = overrides.user ?? buildUser({ id: membership.userId });

  return {
    ...membership,
    user
  };
};

export const buildMembershipWorkspaceSummary = (
  overrides: Partial<MembershipWorkspaceSummary> = {}
): MembershipWorkspaceSummary => ({
  workspace: buildWorkspace({
    id: overrides.workspace?.id,
    ownerId: overrides.workspace?.ownerId,
    name: overrides.workspace?.name,
    slug: overrides.workspace?.slug,
    description: overrides.workspace?.description,
    createdAt: overrides.workspace?.createdAt,
    updatedAt: overrides.workspace?.updatedAt
  })
});

export const buildProject = (overrides: Partial<ProjectRecord> = {}): ProjectRecord => ({
  id: overrides.id ?? '33333333-3333-3333-3333-333333333333',
  workspaceId: overrides.workspaceId ?? '11111111-1111-1111-1111-111111111111',
  ownerId: overrides.ownerId ?? '00000000-0000-0000-0000-000000000000',
  name: overrides.name ?? 'Demo Project',
  key: overrides.key ?? 'DEMO',
  description: Object.prototype.hasOwnProperty.call(overrides, 'description') ? overrides.description ?? null : 'Demo project',
  status: overrides.status ?? 'ACTIVE',
  createdAt: overrides.createdAt ?? timestamp(),
  updatedAt: overrides.updatedAt ?? timestamp(),
  archivedAt: Object.prototype.hasOwnProperty.call(overrides, 'archivedAt') ? overrides.archivedAt ?? null : null
});

export const buildProjectAccess = (
  overrides: Partial<ProjectAccessRecord> = {}
): ProjectAccessRecord => ({
  id: overrides.id ?? '33333333-3333-3333-3333-333333333333',
  workspaceId: overrides.workspaceId ?? '11111111-1111-1111-1111-111111111111',
  ownerId: overrides.ownerId ?? '00000000-0000-0000-0000-000000000000'
});

export const buildTaskSummary = (overrides: Partial<TaskSummaryRecord> = {}): TaskSummaryRecord => ({
  id: overrides.id ?? 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  projectId: overrides.projectId ?? '33333333-3333-3333-3333-333333333333',
  creatorId: overrides.creatorId ?? '00000000-0000-0000-0000-000000000000',
  assigneeId: Object.prototype.hasOwnProperty.call(overrides, 'assigneeId') ? overrides.assigneeId ?? null : null,
  title: overrides.title ?? 'Demo Task',
  status: overrides.status ?? 'TODO',
  priority: overrides.priority ?? 'MEDIUM',
  sortOrder: overrides.sortOrder ?? new Prisma.Decimal(0),
  dueDate: Object.prototype.hasOwnProperty.call(overrides, 'dueDate') ? overrides.dueDate ?? null : timestamp('2024-02-01T00:00:00.000Z'),
  createdAt: overrides.createdAt ?? timestamp(),
  updatedAt: overrides.updatedAt ?? timestamp()
});

export const buildTaskWithWorkspace = (
  overrides: Partial<TaskWithWorkspace> = {}
): TaskWithWorkspace => ({
  id: overrides.id ?? 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  project: {
    workspaceId: overrides.project?.workspaceId ?? '11111111-1111-1111-1111-111111111111'
  }
});

export const buildAttachmentWithUploader = (
  overrides: Partial<AttachmentWithUploader> = {}
): AttachmentWithUploader => ({
  id: overrides.id ?? 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  taskId: overrides.taskId ?? 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  uploaderId: overrides.uploaderId ?? '00000000-0000-0000-0000-000000000000',
  fileName: overrides.fileName ?? 'document.pdf',
  fileSize: overrides.fileSize ?? 1024,
  contentType: overrides.contentType ?? 'application/pdf',
  storageKey: overrides.storageKey ?? 'attachments/key',
  createdAt: overrides.createdAt ?? timestamp(),
  uploader: overrides.uploader ?? {
    id: overrides.uploaderId ?? '00000000-0000-0000-0000-000000000000',
    email: 'user@taskflow.app',
    name: 'Demo User',
    avatarUrl: null
  }
});

export const buildCommentWithAuthor = (
  overrides: Partial<CommentWithAuthor> = {}
): CommentWithAuthor => ({
  id: overrides.id ?? 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  taskId: overrides.taskId ?? 'dddddddd-dddd-dddd-dddd-dddddddddddd',
  authorId: overrides.authorId ?? '00000000-0000-0000-0000-000000000000',
  body: overrides.body ?? 'Looks good to me',
  createdAt: overrides.createdAt ?? timestamp(),
  updatedAt: overrides.updatedAt ?? timestamp(),
  author: overrides.author ?? {
    id: overrides.authorId ?? '00000000-0000-0000-0000-000000000000',
    email: 'user@taskflow.app',
    name: 'Demo User',
    avatarUrl: null
  }
});

export const buildWorkspaceInvite = (
  overrides: Partial<WorkspaceInviteRecord> = {}
): WorkspaceInviteRecord => ({
  id: overrides.id ?? 'invite-00000000-0000-0000-0000-000000000000',
  workspaceId: overrides.workspaceId ?? '11111111-1111-1111-1111-111111111111',
  inviterId: overrides.inviterId ?? '00000000-0000-0000-0000-000000000000',
  email: overrides.email ?? 'invitee@taskflow.app',
  role: overrides.role ?? 'CONTRIBUTOR',
  token: overrides.token ?? 'invite-token',
  expiresAt: overrides.expiresAt ?? timestamp('2024-02-01T00:00:00.000Z'),
  acceptedAt: Object.prototype.hasOwnProperty.call(overrides, 'acceptedAt') ? overrides.acceptedAt ?? null : null,
  createdAt: overrides.createdAt ?? timestamp()
});
