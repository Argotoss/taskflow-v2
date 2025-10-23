// @ts-nocheck
import crypto from 'node:crypto';
import { Prisma } from '@taskflow/db';
import type {
  AuthToken,
  Membership,
  NotificationPreference,
  Project,
  Task,
  User,
  Workspace,
  WorkspaceInvite,
  Comment,
  Attachment
} from '@taskflow/db';
import type { FastifyInstance } from 'fastify';
import { vi } from 'vitest';

type MembershipFilter = {
  workspaceId?: string;
  userId?: string;
  role?: { in: string[] };
  user?: { email?: string };
  workspace?: { is?: { name?: { contains?: string } } };
};

type ProjectFilter = {
  workspaceId?: string;
  status?: string;
  name?: { contains?: string };
};

type TaskFilter = {
  projectId?: string;
  status?: string;
  assigneeId?: string;
  priority?: string;
  title?: { contains?: string };
};

type InviteFilter = {
  workspaceId?: string;
  email?: string;
  acceptedAt?: null;
  token?: string;
  id?: string;
  expiresAt?: { gt?: Date };
};

type MembershipContext = {
  workspaces: Map<string, Workspace>;
  users: Map<string, User>;
};

const matchMembership = (where: unknown, record: Membership, context: MembershipContext): boolean => {
  if (!where) {
    return true;
  }
  const filter = where as MembershipFilter;
  if (filter.workspaceId && filter.workspaceId !== record.workspaceId) {
    return false;
  }
  if (filter.userId && filter.userId !== record.userId) {
    return false;
  }
  if (filter.role?.in && !filter.role.in.includes(record.role)) {
    return false;
  }
  if (filter.user?.email) {
    const user = context.users.get(record.userId);
    if (!user || user.email !== filter.user.email) {
      return false;
    }
  }
  if (filter.workspace?.is?.name?.contains) {
    const workspace = context.workspaces.get(record.workspaceId);
    if (!workspace) {
      return false;
    }
    if (!workspace.name.toLowerCase().includes(filter.workspace.is.name.contains.toLowerCase())) {
      return false;
    }
  }
  return true;
};

const matchProject = (where: unknown, record: Project): boolean => {
  if (!where) {
    return true;
  }
  const filter = where as ProjectFilter;
  if (filter.workspaceId && filter.workspaceId !== record.workspaceId) {
    return false;
  }
  if (filter.status && filter.status !== record.status) {
    return false;
  }
  if (filter.name?.contains) {
    if (!record.name.toLowerCase().includes(filter.name.contains.toLowerCase())) {
      return false;
    }
  }
  return true;
};

const matchTask = (where: unknown, record: Task): boolean => {
  if (!where) {
    return true;
  }
  const filter = where as TaskFilter;
  if (filter.projectId && filter.projectId !== record.projectId) {
    return false;
  }
  if (filter.status && filter.status !== record.status) {
    return false;
  }
  if (filter.assigneeId && filter.assigneeId !== record.assigneeId) {
    return false;
  }
  if (filter.priority && filter.priority !== record.priority) {
    return false;
  }
  if (filter.title?.contains) {
    if (!record.title.toLowerCase().includes(filter.title.contains.toLowerCase())) {
      return false;
    }
  }
  return true;
};

const matchInvite = (where: unknown, record: WorkspaceInvite): boolean => {
  if (!where) {
    return true;
  }
  const filter = where as InviteFilter;
  if (filter.workspaceId && filter.workspaceId !== record.workspaceId) {
    return false;
  }
  if (filter.email && filter.email !== record.email) {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(filter, 'acceptedAt') && record.acceptedAt !== filter.acceptedAt) {
    return false;
  }
  if (filter.token && filter.token !== record.token) {
    return false;
  }
  if (filter.id && filter.id !== record.id) {
    return false;
  }
  if (filter.expiresAt?.gt) {
    if (!(record.expiresAt > filter.expiresAt.gt)) {
      return false;
    }
  }
  if (filter.expiresAt && !filter.expiresAt.gt) {
    return false;
  }
  return true;
};

const cloneDate = (value: Date): Date => new Date(value);

const cloneWorkspace = (record: Workspace): Workspace => ({
  ...record,
  createdAt: cloneDate(record.createdAt),
  updatedAt: cloneDate(record.updatedAt)
});

const cloneMembership = (record: Membership): Membership => ({
  ...record,
  createdAt: cloneDate(record.createdAt),
  updatedAt: cloneDate(record.updatedAt)
});

const cloneProject = (record: Project): Project => ({
  ...record,
  createdAt: cloneDate(record.createdAt),
  updatedAt: cloneDate(record.updatedAt)
});

const cloneTask = (record: Task): Task => ({
  ...record,
  sortOrder: new Prisma.Decimal(record.sortOrder),
  dueDate: record.dueDate ? cloneDate(record.dueDate) : null,
  createdAt: cloneDate(record.createdAt),
  updatedAt: cloneDate(record.updatedAt)
});

const cloneInvite = (record: WorkspaceInvite): WorkspaceInvite => ({
  ...record,
  expiresAt: cloneDate(record.expiresAt),
  acceptedAt: record.acceptedAt ? cloneDate(record.acceptedAt) : null,
  createdAt: cloneDate(record.createdAt)
});

const cloneUser = (record: User): User => ({
  ...record,
  createdAt: cloneDate(record.createdAt),
  updatedAt: cloneDate(record.updatedAt)
});

const clonePreference = (record: NotificationPreference): NotificationPreference => ({
  ...record,
  createdAt: cloneDate(record.createdAt),
  updatedAt: cloneDate(record.updatedAt)
});

const now = (): Date => new Date();

type Spy = ReturnType<typeof vi.spyOn>;

export class InMemoryPrisma {
  private readonly workspaces = new Map<string, Workspace>();
  private readonly memberships = new Map<string, Membership>();
  private readonly projects = new Map<string, Project>();
  private readonly tasks = new Map<string, Task>();
  private readonly invites = new Map<string, WorkspaceInvite>();
  private readonly users = new Map<string, User>();
  private readonly preferences = new Map<string, NotificationPreference>();
  private readonly tokens = new Map<string, AuthToken>();
  private readonly comments = new Map<string, Comment>();
  private readonly attachments = new Map<string, Attachment>();
  private spies: Spy[] = [];

  reset(): void {
    this.workspaces.clear();
    this.memberships.clear();
    this.projects.clear();
    this.tasks.clear();
    this.invites.clear();
    this.preferences.clear();
    this.tokens.clear();
  }

  upsertUser(record: User): void {
    this.users.set(record.id, cloneUser(record));
  }

  upsertPreference(record: NotificationPreference): void {
    this.preferences.set(record.id, clonePreference(record));
  }

  upsertWorkspace(record: Workspace): void {
    this.workspaces.set(record.id, cloneWorkspace(record));
  }

  upsertMembership(record: Membership): void {
    this.memberships.set(record.id, cloneMembership(record));
  }

  upsertProject(record: Project): void {
    this.projects.set(record.id, cloneProject(record));
  }

  upsertTask(record: Task): void {
    this.tasks.set(record.id, cloneTask(record));
  }

  apply(app: FastifyInstance): void {
    this.spies = [
      vi.spyOn(app.prisma.workspace, 'findUnique').mockImplementation(this.workspaceFindUnique),
      vi.spyOn(app.prisma.workspace, 'create').mockImplementation(this.workspaceCreate),
      vi.spyOn(app.prisma.workspace, 'update').mockImplementation(this.workspaceUpdate),
      vi.spyOn(app.prisma.membership, 'findMany').mockImplementation(this.membershipFindMany),
      vi.spyOn(app.prisma.membership, 'count').mockImplementation(this.membershipCount),
      vi.spyOn(app.prisma.membership, 'findFirst').mockImplementation(this.membershipFindFirst),
      vi.spyOn(app.prisma.membership, 'create').mockImplementation(this.memberCreate),
      vi.spyOn(app.prisma.membership, 'upsert').mockImplementation(this.memberUpsert),
      vi.spyOn(app.prisma.project, 'findMany').mockImplementation(this.projectFindMany),
      vi.spyOn(app.prisma.project, 'count').mockImplementation(this.projectCount),
      vi.spyOn(app.prisma.project, 'findFirst').mockImplementation(this.projectFindFirst),
      vi.spyOn(app.prisma.project, 'create').mockImplementation(this.projectCreate),
      vi.spyOn(app.prisma.project, 'findUnique').mockImplementation(this.projectFindUnique),
      vi.spyOn(app.prisma.project, 'update').mockImplementation(this.projectUpdate),
      vi.spyOn(app.prisma.task, 'aggregate').mockImplementation(this.taskAggregate),
      vi.spyOn(app.prisma.task, 'create').mockImplementation(this.taskCreate),
      vi.spyOn(app.prisma.task, 'findMany').mockImplementation(this.taskFindMany),
      vi.spyOn(app.prisma.task, 'count').mockImplementation(this.taskCount),
      vi.spyOn(app.prisma.task, 'updateMany').mockImplementation(this.taskUpdateMany),
      vi.spyOn(app.prisma.task, 'findUnique').mockImplementation(this.taskFindUnique),
      vi.spyOn(app.prisma.task, 'update').mockImplementation(this.taskUpdate),
      vi.spyOn(app.prisma.task, 'delete').mockImplementation(this.taskDelete),
      vi.spyOn(app.prisma.workspaceInvite, 'deleteMany').mockImplementation(this.inviteDeleteMany),
      vi.spyOn(app.prisma.workspaceInvite, 'create').mockImplementation(this.inviteCreate),
      vi.spyOn(app.prisma.workspaceInvite, 'findMany').mockImplementation(this.inviteFindMany),
      vi.spyOn(app.prisma.workspaceInvite, 'findFirst').mockImplementation(this.inviteFindFirst),
      vi.spyOn(app.prisma.workspaceInvite, 'update').mockImplementation(this.inviteUpdate),
      vi.spyOn(app.prisma.comment, 'deleteMany').mockImplementation(this.commentDeleteMany),
      vi.spyOn(app.prisma.attachment, 'deleteMany').mockImplementation(this.attachmentDeleteMany),
      vi.spyOn(app.prisma.user, 'findUnique').mockImplementation(this.userFindUnique),
      vi.spyOn(app.prisma.user, 'create').mockImplementation(this.userCreate),
      vi.spyOn(app.prisma.user, 'update').mockImplementation(this.userUpdate),
      vi.spyOn(app.prisma.user, 'findUniqueOrThrow').mockImplementation(this.userFindUniqueOrThrow),
      vi.spyOn(app.prisma.notificationPreference, 'create').mockImplementation(this.preferenceCreate),
      vi.spyOn(app.prisma.authToken, 'create').mockImplementation(this.tokenCreate),
      vi.spyOn(app.prisma.authToken, 'deleteMany').mockImplementation(this.tokenDeleteMany),
      vi.spyOn(app.prisma.authToken, 'findUnique').mockImplementation(this.tokenFindUnique),
      vi.spyOn(app.prisma.authToken, 'delete').mockImplementation(this.tokenDelete),
      vi.spyOn(app.prisma, '$transaction').mockImplementation(this.transaction)
    ];
  }

  restore(): void {
    this.spies.forEach((spy) => {
      spy.mockRestore();
    });
    this.spies = [];
  }

  private workspaceFindUnique = async (args: Prisma.WorkspaceFindUniqueArgs): Promise<Workspace | null> => {
    if (!args.where) {
      return null;
    }
    if (args.where.id) {
      const existing = this.workspaces.get(args.where.id);
      return existing ? cloneWorkspace(existing) : null;
    }
    if (args.where.slug) {
      const match = Array.from(this.workspaces.values()).find((workspace) => workspace.slug === args.where.slug);
      return match ? cloneWorkspace(match) : null;
    }
    return null;
  };

  private workspaceCreate = async (args: Prisma.WorkspaceCreateArgs): Promise<Workspace> => {
    const id = crypto.randomUUID();
    const created = {
      id,
      ownerId: args.data.ownerId,
      name: args.data.name,
      slug: args.data.slug,
      description: args.data.description ?? null,
      createdAt: now(),
      updatedAt: now()
    };
    this.workspaces.set(id, created);
    const membership = {
      id: crypto.randomUUID(),
      workspaceId: id,
      userId: args.data.memberships?.create?.userId ?? args.data.ownerId,
      role: args.data.memberships?.create?.role ?? 'OWNER',
      createdAt: now(),
      updatedAt: now()
    };
    this.memberships.set(membership.id, membership);
    return cloneWorkspace(created);
  };

  private workspaceUpdate = async (args: Prisma.WorkspaceUpdateArgs): Promise<Workspace> => {
    if (!args.where.id) {
      throw new Error('Workspace identifier required');
    }
    const existing = this.workspaces.get(args.where.id);
    if (!existing) {
      throw new Error('Workspace not found');
    }
    const updated = {
      ...existing,
      name: args.data.name ?? existing.name,
      description: Object.prototype.hasOwnProperty.call(args.data, 'description') ?
        (args.data.description as string | null | undefined) ?? null :
        existing.description,
      updatedAt: now()
    };
    this.workspaces.set(updated.id, updated);
    return cloneWorkspace(updated);
  };

  private membershipFindMany = async (args: Prisma.MembershipFindManyArgs): Promise<unknown[]> => {
    const context: MembershipContext = { workspaces: this.workspaces, users: this.users };
    const filtered = Array.from(this.memberships.values()).filter((record) => matchMembership(args.where, record, context));
    const ordered = args.orderBy &&
      'workspace' in args.orderBy &&
      args.orderBy.workspace &&
      'createdAt' in args.orderBy.workspace &&
      args.orderBy.workspace.createdAt === 'desc'
        ? filtered.sort(
            (left, right) =>
              this.workspaces.get(right.workspaceId)!.createdAt.getTime() -
              this.workspaces.get(left.workspaceId)!.createdAt.getTime()
          )
        : filtered;
    const start = args.skip ?? 0;
    const end = args.take ? start + args.take : undefined;
    const sliced = ordered.slice(start, end);
    if (args.select?.workspace) {
      return sliced.map((membership) => ({
        workspace: this.pickWorkspace(membership.workspaceId, args.select?.workspace)
      }));
    }
    if (args.select?.user) {
      return sliced.map((membership) => ({
        id: membership.id,
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        role: membership.role,
        createdAt: cloneDate(membership.createdAt),
        updatedAt: cloneDate(membership.updatedAt),
        user: this.pickUser(membership.userId, args.select?.user)
      }));
    }
    return sliced.map((membership) => cloneMembership(membership));
  };

  private membershipCount = async (args: Prisma.MembershipCountArgs): Promise<number> => {
    const context: MembershipContext = { workspaces: this.workspaces, users: this.users };
    return Array.from(this.memberships.values()).filter((record) => matchMembership(args.where, record, context)).length;
  };

  private membershipFindFirst = async (args: Prisma.MembershipFindFirstArgs): Promise<Membership | null> => {
    const context: MembershipContext = { workspaces: this.workspaces, users: this.users };
    const match = Array.from(this.memberships.values()).find((record) => matchMembership(args.where, record, context));
    return match ? cloneMembership(match) : null;
  };

  private memberCreate = async (args: Prisma.MembershipCreateArgs): Promise<Membership> => {
    const record = {
      id: crypto.randomUUID(),
      workspaceId: args.data.workspaceId,
      userId: args.data.userId,
      role: args.data.role,
      createdAt: now(),
      updatedAt: now()
    };
    this.memberships.set(record.id, record);
    return cloneMembership(record);
  };

  private memberUpsert = async (args: Prisma.MembershipUpsertArgs): Promise<Membership> => {
    const existing = Array.from(this.memberships.values()).find(
      (record) =>
        record.workspaceId === args.where.workspaceId_userId.workspaceId &&
        record.userId === args.where.workspaceId_userId.userId
    );
    if (existing) {
      const updated = {
        ...existing,
        role: args.update.role ?? existing.role,
        updatedAt: now()
      };
      this.memberships.set(updated.id, updated);
      return cloneMembership(updated);
    }
    const created = {
      id: crypto.randomUUID(),
      workspaceId: args.create.workspaceId,
      userId: args.create.userId,
      role: args.create.role,
      createdAt: now(),
      updatedAt: now()
    };
    this.memberships.set(created.id, created);
    return cloneMembership(created);
  };

  private projectFindMany = async (args: Prisma.ProjectFindManyArgs): Promise<Project[]> => {
    const filtered = Array.from(this.projects.values()).filter((record) => matchProject(args.where, record));
    const ordered = args.orderBy?.createdAt === 'desc'
      ? filtered.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      : filtered;
    const start = args.skip ?? 0;
    const end = args.take ? start + args.take : undefined;
    return ordered.slice(start, end).map((record) => cloneProject(record));
  };

  private projectCount = async (args: Prisma.ProjectCountArgs): Promise<number> => {
    return Array.from(this.projects.values()).filter((record) => matchProject(args.where, record)).length;
  };

  private projectFindFirst = async (args: Prisma.ProjectFindFirstArgs): Promise<Project | null> => {
    const match = Array.from(this.projects.values()).find((record) => {
      if (!args.where) {
        return true;
      }
      if (args.where.workspaceId && record.workspaceId !== args.where.workspaceId) {
        return false;
      }
      if (args.where.key && record.key !== args.where.key) {
        return false;
      }
      return true;
    });
    return match ? cloneProject(match) : null;
  };

  private projectCreate = async (args: Prisma.ProjectCreateArgs): Promise<Project> => {
    const record = {
      id: crypto.randomUUID(),
      workspaceId: args.data.workspaceId,
      ownerId: args.data.ownerId,
      name: args.data.name,
      key: args.data.key,
      description: args.data.description ?? null,
      status: 'ACTIVE',
      createdAt: now(),
      updatedAt: now(),
      archivedAt: null
    };
    this.projects.set(record.id, record);
    return cloneProject(record);
  };

  private projectFindUnique = async (args: Prisma.ProjectFindUniqueArgs): Promise<Project | null> => {
    if (!args.where?.id) {
      return null;
    }
    const match = this.projects.get(args.where.id);
    return match ? cloneProject(match) : null;
  };

  private projectUpdate = async (args: Prisma.ProjectUpdateArgs): Promise<Project> => {
    if (!args.where.id) {
      throw new Error('Project identifier required');
    }
    const existing = this.projects.get(args.where.id);
    if (!existing) {
      throw new Error('Project not found');
    }
    const updated = {
      ...existing,
      name: args.data.name ?? existing.name,
      description: Object.prototype.hasOwnProperty.call(args.data, 'description') ?
        (args.data.description as string | null | undefined) ?? null :
        existing.description,
      status: args.data.status ?? existing.status,
      updatedAt: now()
    };
    this.projects.set(updated.id, updated);
    return cloneProject(updated);
  };

  private taskAggregate = async (args: Prisma.TaskAggregateArgs): Promise<{ _max: { sortOrder: Prisma.Decimal | null } }> => {
    const filtered = Array.from(this.tasks.values()).filter((record) => matchTask(args.where, record));
    if (filtered.length === 0) {
      return { _max: { sortOrder: null } };
    }
    const max = filtered.reduce((highest, record) => {
      const value = record.sortOrder instanceof Prisma.Decimal ? record.sortOrder.toNumber() : Number(record.sortOrder);
      return value > highest ? value : highest;
    }, 0);
    return { _max: { sortOrder: new Prisma.Decimal(max) } };
  };

  private taskCreate = async (args: Prisma.TaskCreateArgs): Promise<Task> => {
    const record: Task = {
      id: crypto.randomUUID(),
      projectId: args.data.projectId,
      creatorId: args.data.creatorId,
      assigneeId: args.data.assigneeId ?? null,
      title: args.data.title,
      description: args.data.description ?? null,
      status: args.data.status ?? 'TODO',
      priority: args.data.priority ?? 'MEDIUM',
      sortOrder: args.data.sortOrder instanceof Prisma.Decimal ? args.data.sortOrder : new Prisma.Decimal(args.data.sortOrder ?? 0),
      dueDate: args.data.dueDate ?? null,
      startedAt: null,
      completedAt: null,
      createdAt: now(),
      updatedAt: now()
    };
    this.tasks.set(record.id, record);
    return cloneTask(record);
  };

  private taskFindMany = async (args: Prisma.TaskFindManyArgs): Promise<unknown[]> => {
    const filtered = Array.from(this.tasks.values()).filter((record) => matchTask(args.where, record));
    const ordered = args.orderBy && 'sortOrder' in args.orderBy && args.orderBy.sortOrder === 'asc'
      ? filtered.sort((left, right) => {
          const a = left.sortOrder instanceof Prisma.Decimal ? left.sortOrder.toNumber() : Number(left.sortOrder);
          const b = right.sortOrder instanceof Prisma.Decimal ? right.sortOrder.toNumber() : Number(right.sortOrder);
          return a - b;
        })
      : filtered;
    const start = args.skip ?? 0;
    const end = args.take ? start + args.take : undefined;
    const sliced = ordered.slice(start, end);
    if (args.select?.id && Object.keys(args.select).length === 1) {
      return sliced.map((record) => ({ id: record.id }));
    }
    return sliced.map((record) => cloneTask(record));
  };

  private taskCount = async (args: Prisma.TaskCountArgs): Promise<number> => {
    return Array.from(this.tasks.values()).filter((record) => matchTask(args.where, record)).length;
  };

  private taskUpdateMany = async (args: Prisma.TaskUpdateManyArgs): Promise<{ count: number }> => {
    const entries = Array.from(this.tasks.values()).filter(
      (record) =>
        (!args.where?.id || record.id === args.where.id) &&
        (!args.where?.projectId || record.projectId === args.where.projectId)
    );
    entries.forEach((record) => {
      const updated = {
        ...record,
        status: args.data.status ?? record.status,
        sortOrder:
          args.data.sortOrder instanceof Prisma.Decimal
            ? args.data.sortOrder
            : args.data.sortOrder
              ? new Prisma.Decimal(args.data.sortOrder)
              : record.sortOrder,
        updatedAt: now()
      };
      this.tasks.set(updated.id, updated);
    });
    return { count: entries.length };
  };

  private taskFindUnique = async (args: Prisma.TaskFindUniqueArgs): Promise<Task | null> => {
    if (!args.where?.id) {
      return null;
    }
    const match = this.tasks.get(args.where.id);
    return match ? cloneTask(match) : null;
  };

  private taskUpdate = async (args: Prisma.TaskUpdateArgs): Promise<Task> => {
    if (!args.where.id) {
      throw new Error('Task identifier required');
    }
    const existing = this.tasks.get(args.where.id);
    if (!existing) {
      throw new Error('Task not found');
    }
    const updated: Task = {
      ...existing,
      title: args.data.title ?? existing.title,
      description: Object.prototype.hasOwnProperty.call(args.data, 'description') ?
        (args.data.description as string | null | undefined) ?? null :
        existing.description,
      status: args.data.status ?? existing.status,
      priority: args.data.priority ?? existing.priority,
      assigneeId: Object.prototype.hasOwnProperty.call(args.data, 'assigneeId') ?
        ((args.data.assigneeId as string | null | undefined) ?? null) :
        existing.assigneeId,
      dueDate: Object.prototype.hasOwnProperty.call(args.data, 'dueDate') ?
        ((args.data.dueDate as Date | null | undefined) ?? null) :
        existing.dueDate,
      sortOrder:
        args.data.sortOrder instanceof Prisma.Decimal
          ? args.data.sortOrder
          : args.data.sortOrder
            ? new Prisma.Decimal(args.data.sortOrder)
            : existing.sortOrder,
      updatedAt: now()
    };
    this.tasks.set(updated.id, updated);
    return cloneTask(updated);
  };

  private taskDelete = async (args: Prisma.TaskDeleteArgs): Promise<Task> => {
    if (!args.where.id) {
      throw new Error('Task identifier required');
    }
    const existing = this.tasks.get(args.where.id);
    if (!existing) {
      throw new Error('Task not found');
    }
    this.tasks.delete(existing.id);
    return cloneTask(existing);
  };

  private commentDeleteMany = async (args: Prisma.CommentDeleteManyArgs): Promise<{ count: number }> => {
    const taskId = args.where?.taskId;
    if (!taskId) {
      const size = this.comments.size;
      this.comments.clear();
      return { count: size };
    }
    let count = 0;
    for (const [id, comment] of this.comments.entries()) {
      if (comment.taskId === taskId) {
        this.comments.delete(id);
        count += 1;
      }
    }
    return { count };
  };

  private attachmentDeleteMany = async (args: Prisma.AttachmentDeleteManyArgs): Promise<{ count: number }> => {
    const taskId = args.where?.taskId;
    if (!taskId) {
      const size = this.attachments.size;
      this.attachments.clear();
      return { count: size };
    }
    let count = 0;
    for (const [id, attachment] of this.attachments.entries()) {
      if (attachment.taskId === taskId) {
        this.attachments.delete(id);
        count += 1;
      }
    }
    return { count };
  };

  private inviteDeleteMany = async (args: Prisma.WorkspaceInviteDeleteManyArgs): Promise<{ count: number }> => {
    const matching = Array.from(this.invites.values()).filter((record) => matchInvite(args.where, record));
    matching.forEach((record) => this.invites.delete(record.id));
    return { count: matching.length };
  };

  private inviteCreate = async (args: Prisma.WorkspaceInviteCreateArgs): Promise<WorkspaceInvite> => {
    const record: WorkspaceInvite = {
      id: crypto.randomUUID(),
      workspaceId: args.data.workspaceId,
      inviterId: args.data.inviterId,
      email: args.data.email,
      role: args.data.role,
      token: args.data.token ?? crypto.randomUUID(),
      expiresAt: args.data.expiresAt,
      acceptedAt: null,
      createdAt: now()
    };
    this.invites.set(record.id, record);
    return cloneInvite(record);
  };

  private inviteFindMany = async (args: Prisma.WorkspaceInviteFindManyArgs): Promise<WorkspaceInvite[]> => {
    const filtered = Array.from(this.invites.values()).filter((record) => matchInvite(args.where, record));
    const ordered = args.orderBy?.createdAt === 'desc'
      ? filtered.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      : filtered;
    return ordered.map((record) => cloneInvite(record));
  };

  private inviteFindFirst = async (args: Prisma.WorkspaceInviteFindFirstArgs): Promise<unknown> => {
    const match = Array.from(this.invites.values()).find((record) => matchInvite(args.where, record));
    if (!match) {
      return null;
    }
    if (args.include?.workspace) {
      return {
        ...cloneInvite(match),
        workspace: this.pickWorkspace(match.workspaceId, args.include.workspace)
      };
    }
    return cloneInvite(match);
  };

  private inviteUpdate = async (args: Prisma.WorkspaceInviteUpdateArgs): Promise<WorkspaceInvite> => {
    if (!args.where.id) {
      throw new Error('Invite identifier required');
    }
    const existing = this.invites.get(args.where.id);
    if (!existing) {
      throw new Error('Invite not found');
    }
    const updated = {
      ...existing,
      acceptedAt: (args.data.acceptedAt as Date | null | undefined) ?? existing.acceptedAt,
      expiresAt: (args.data.expiresAt as Date | undefined) ?? existing.expiresAt
    };
    this.invites.set(updated.id, updated);
    return cloneInvite(updated);
  };

  private userFindUnique = async (args: Prisma.UserFindUniqueArgs): Promise<unknown> => {
    if (!args.where) {
      return null;
    }
    let match: User | undefined;
    if (args.where.id) {
      match = this.users.get(args.where.id);
    } else if (args.where.email) {
      match = Array.from(this.users.values()).find((record) => record.email === args.where.email);
    }
    if (!match) {
      return null;
    }
    if (args.include?.notificationPreference) {
      const preference = Array.from(this.preferences.values()).find((record) => record.userId === match!.id) ?? null;
      return {
        ...cloneUser(match),
        notificationPreference: preference ? clonePreference(preference) : null
      };
    }
    return cloneUser(match);
  };

  private userCreate = async (args: Prisma.UserCreateArgs): Promise<unknown> => {
    const record: User = {
      id: crypto.randomUUID(),
      email: args.data.email,
      passwordHash: args.data.passwordHash,
      name: args.data.name,
      avatarUrl: null,
      timezone: null,
      createdAt: now(),
      updatedAt: now()
    };
    this.users.set(record.id, record);
    let preference: NotificationPreference | null = null;
    if (args.data.notificationPreference?.create) {
      preference = {
        id: crypto.randomUUID(),
        userId: record.id,
        emailMentions: true,
        emailTaskUpdates: true,
        inAppMentions: true,
        inAppTaskUpdates: true,
        createdAt: now(),
        updatedAt: now()
      };
      this.preferences.set(preference.id, preference);
    }
    if (args.include?.notificationPreference) {
      return {
        ...cloneUser(record),
        notificationPreference: preference ? clonePreference(preference) : null
      };
    }
    return cloneUser(record);
  };

  private userUpdate = async (args: Prisma.UserUpdateArgs): Promise<User> => {
    if (!args.where.id) {
      throw new Error('User identifier required');
    }
    const existing = this.users.get(args.where.id);
    if (!existing) {
      throw new Error('User not found');
    }
    const updated = {
      ...existing,
      passwordHash: args.data.passwordHash ?? existing.passwordHash,
      updatedAt: now()
    };
    this.users.set(updated.id, updated);
    return cloneUser(updated);
  };

  private userFindUniqueOrThrow = async (args: Prisma.UserFindUniqueOrThrowArgs): Promise<unknown> => {
    const match = await this.userFindUnique(args);
    if (!match) {
      throw new Error('User not found');
    }
    return match;
  };

  private preferenceCreate = async (args: Prisma.NotificationPreferenceCreateArgs): Promise<NotificationPreference> => {
    const record: NotificationPreference = {
      id: crypto.randomUUID(),
      userId: args.data.userId,
      emailMentions: true,
      emailTaskUpdates: true,
      inAppMentions: true,
      inAppTaskUpdates: true,
      createdAt: now(),
      updatedAt: now()
    };
    this.preferences.set(record.id, record);
    return clonePreference(record);
  };

  private tokenCreate = async (args: Prisma.AuthTokenCreateArgs): Promise<AuthToken> => {
    const record: AuthToken = {
      id: crypto.randomUUID(),
      userId: args.data.userId,
      type: args.data.type,
      tokenHash: args.data.tokenHash,
      expiresAt: args.data.expiresAt,
      userAgent: args.data.userAgent ?? null,
      ipAddress: args.data.ipAddress ?? null,
      issuedAt: now(),
      lastUsedAt: null,
      createdAt: now()
    };
    this.tokens.set(record.id, record);
    return { ...record };
  };

  private tokenDeleteMany = async (args: Prisma.AuthTokenDeleteManyArgs): Promise<{ count: number }> => {
    const matches = Array.from(this.tokens.values()).filter((record) => {
      if (args.where?.tokenHash && record.tokenHash !== args.where.tokenHash) {
        return false;
      }
      if (args.where?.type && record.type !== args.where.type) {
        return false;
      }
      if (args.where?.userId && record.userId !== args.where.userId) {
        return false;
      }
      return true;
    });
    matches.forEach((record) => this.tokens.delete(record.id));
    return { count: matches.length };
  };

  private tokenFindUnique = async (args: Prisma.AuthTokenFindUniqueArgs): Promise<unknown> => {
    if (!args.where.tokenHash) {
      return null;
    }
    const match = Array.from(this.tokens.values()).find((record) => record.tokenHash === args.where.tokenHash);
    if (!match) {
      return null;
    }
    if (args.select) {
      const selected: Record<string, unknown> = {};
      Object.entries(args.select).forEach(([key, chosen]) => {
        if (chosen) {
          selected[key] = (match as Record<string, unknown>)[key];
        }
      });
      return selected;
    }
    return { ...match };
  };

  private tokenDelete = async (args: Prisma.AuthTokenDeleteArgs): Promise<AuthToken> => {
    if (!args.where.id) {
      throw new Error('Auth token identifier required');
    }
    const existing = this.tokens.get(args.where.id);
    if (!existing) {
      throw new Error('Auth token not found');
    }
    this.tokens.delete(existing.id);
    return { ...existing };
  };

  private transaction = async <T>(operations: unknown): Promise<T | unknown[]> => {
    if (Array.isArray(operations)) {
      return Promise.all(operations);
    }
    const transactionClient = {
      workspace: {
        findUnique: this.workspaceFindUnique,
        create: this.workspaceCreate,
        update: this.workspaceUpdate
      },
      membership: {
        findMany: this.membershipFindMany,
        count: this.membershipCount,
        findFirst: this.membershipFindFirst,
        create: this.memberCreate,
        upsert: this.memberUpsert
      },
      project: {
        findMany: this.projectFindMany,
        count: this.projectCount,
        findFirst: this.projectFindFirst,
        create: this.projectCreate,
        findUnique: this.projectFindUnique,
        update: this.projectUpdate
      },
      task: {
        aggregate: this.taskAggregate,
        create: this.taskCreate,
        findMany: this.taskFindMany,
        count: this.taskCount,
        updateMany: this.taskUpdateMany,
        findUnique: this.taskFindUnique,
        update: this.taskUpdate,
        delete: this.taskDelete
      },
      workspaceInvite: {
        deleteMany: this.inviteDeleteMany,
        create: this.inviteCreate,
        findMany: this.inviteFindMany,
        findFirst: this.inviteFindFirst,
        update: this.inviteUpdate
      },
      user: {
        findUnique: this.userFindUnique,
        create: this.userCreate,
        update: this.userUpdate,
        findUniqueOrThrow: this.userFindUniqueOrThrow
      },
      notificationPreference: {
        create: this.preferenceCreate
      },
      authToken: {
        create: this.tokenCreate,
        deleteMany: this.tokenDeleteMany,
        findUnique: this.tokenFindUnique,
        delete: this.tokenDelete
      }
    };
    if (typeof operations === 'function') {
      const result = Reflect.apply(operations as CallableFunction, null, [transactionClient]);
      return result as Promise<T>;
    }
    throw new Error('Unsupported transaction payload');
  };

  private pickWorkspace(workspaceId: string, select: unknown): Workspace {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    const fields = select as { select?: Record<string, boolean> };
    if (!fields.select) {
      return cloneWorkspace(workspace);
    }
    const result: Record<string, unknown> = {};
    Object.entries(fields.select).forEach(([key, included]) => {
      if (!included) {
        return;
      }
      const value = (workspace as Record<string, unknown>)[key];
      result[key] = value instanceof Date ? cloneDate(value) : value;
    });
    return result as Workspace;
  }

  private pickUser(userId: string, select: unknown): unknown {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }
    const fields = select as { select?: Record<string, boolean> };
    if (!fields.select) {
      return cloneUser(user);
    }
    const result: Record<string, unknown> = {};
    Object.entries(fields.select).forEach(([key, included]) => {
      if (!included) {
        return;
      }
      const value = (user as Record<string, unknown>)[key];
      result[key] = value instanceof Date ? cloneDate(value) : value;
    });
    return result;
  }
}

export const createInMemoryPrisma = (): InMemoryPrisma => new InMemoryPrisma();
