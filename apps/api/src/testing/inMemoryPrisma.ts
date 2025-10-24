// @ts-nocheck
import crypto from 'node:crypto';
import { Prisma } from '@taskflow/db';
import type {
  Attachment,
  AuthToken,
  Comment,
  Membership,
  NotificationPreference,
  Project,
  Task,
  TaskChecklistItem,
  User,
  Workspace,
  WorkspaceInvite
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

type ChecklistItemFilter = {
  taskId?: string;
  id?: string;
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

const matchChecklistItem = (where: unknown, record: TaskChecklistItem): boolean => {
  if (!where) {
    return true;
  }
  const filter = where as ChecklistItemFilter;
  if (filter.taskId && filter.taskId !== record.taskId) {
    return false;
  }
  if (filter.id && filter.id !== record.id) {
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

const cloneChecklistItem = (record: TaskChecklistItem): TaskChecklistItem => ({
  ...record,
  position: record.position instanceof Prisma.Decimal ? record.position : new Prisma.Decimal(record.position),
  completedAt: record.completedAt ? cloneDate(record.completedAt) : null,
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
  private readonly comments = new Map<string, Comment>();
  private readonly attachments = new Map<string, Attachment>();
  private readonly checklistItems = new Map<string, TaskChecklistItem>();
  private readonly invites = new Map<string, WorkspaceInvite>();
  private readonly users = new Map<string, User>();
  private readonly preferences = new Map<string, NotificationPreference>();
  private readonly tokens = new Map<string, AuthToken>();
  private spies: Spy[] = [];

  reset(): void {
    this.workspaces.clear();
    this.memberships.clear();
    this.projects.clear();
    this.tasks.clear();
    this.comments.clear();
    this.attachments.clear();
    this.checklistItems.clear();
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
      vi.spyOn(app.prisma.membership, 'findUnique').mockImplementation(this.membershipFindUnique),
      vi.spyOn(app.prisma.membership, 'update').mockImplementation(this.membershipUpdate),
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
      vi.spyOn(app.prisma.taskChecklistItem, 'aggregate').mockImplementation(this.checklistAggregate),
      vi.spyOn(app.prisma.taskChecklistItem, 'findMany').mockImplementation(this.checklistFindMany),
      vi.spyOn(app.prisma.taskChecklistItem, 'create').mockImplementation(this.checklistCreate),
      vi.spyOn(app.prisma.taskChecklistItem, 'update').mockImplementation(this.checklistUpdate),
      vi.spyOn(app.prisma.taskChecklistItem, 'delete').mockImplementation(this.checklistDelete),
      vi.spyOn(app.prisma.taskChecklistItem, 'deleteMany').mockImplementation(this.checklistDeleteMany),
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
    let ownerId = existing.ownerId;
    if (Object.prototype.hasOwnProperty.call(args.data, 'ownerId')) {
      const value = args.data.ownerId as unknown;
      if (typeof value === 'string') {
        ownerId = value;
      } else if (value && typeof value === 'object' && 'set' in value) {
        ownerId = (value as { set: string }).set;
      }
    }
    const updated = {
      ...existing,
      name: args.data.name ?? existing.name,
      description: Object.prototype.hasOwnProperty.call(args.data, 'description') ?
        (args.data.description as string | null | undefined) ?? null :
        existing.description,
      ownerId,
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

  private membershipFindUnique = async (args: Prisma.MembershipFindUniqueArgs): Promise<Membership | null> => {
    if (!args.where) {
      return null;
    }
    if (args.where.id) {
      const match = this.memberships.get(args.where.id);
      return match ? cloneMembership(match) : null;
    }
    if (args.where.workspaceId_userId) {
      const composite = args.where.workspaceId_userId;
      const match = Array.from(this.memberships.values()).find(
        (record) => record.workspaceId === composite.workspaceId && record.userId === composite.userId
      );
      return match ? cloneMembership(match) : null;
    }
    return null;
  };

  private membershipUpdate = async (args: Prisma.MembershipUpdateArgs): Promise<Membership> => {
    const locateByComposite = (): Membership | undefined => {
      if (!args.where.workspaceId_userId) {
        return undefined;
      }
      const composite = args.where.workspaceId_userId;
      return Array.from(this.memberships.values()).find(
        (record) => record.workspaceId === composite.workspaceId && record.userId === composite.userId
      );
    };
    const existing =
      (args.where.id ? this.memberships.get(args.where.id) : undefined) ?? locateByComposite();
    if (!existing) {
      throw new Error('Membership not found');
    }
    let role = existing.role;
    if (Object.prototype.hasOwnProperty.call(args.data, 'role')) {
      const value = args.data.role as unknown;
      if (typeof value === 'string') {
        role = value as Membership['role'];
      } else if (value && typeof value === 'object' && 'set' in value) {
        const setter = value as { set: Membership['role'] };
        role = setter.set;
      }
    }
    const updated: Membership = {
      ...existing,
      role,
      updatedAt: now()
    };
    this.memberships.set(updated.id, updated);
    return cloneMembership(updated);
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

  private checklistAggregate = async (args: Prisma.TaskChecklistItemAggregateArgs): Promise<{ _max: { position: Prisma.Decimal | null } }> => {
    const filtered = Array.from(this.checklistItems.values()).filter((record) => matchChecklistItem(args.where, record));
    if (!args._max?.position || filtered.length === 0) {
      return { _max: { position: null } };
    }
    const max = filtered.reduce((highest, record) => {
      const value = record.position instanceof Prisma.Decimal ? record.position.toNumber() : Number(record.position);
      return value > highest ? value : highest;
    }, 0);
    return { _max: { position: new Prisma.Decimal(max) } };
  };

  private getChecklistItemsForTask = (taskId: string): TaskChecklistItem[] => {
    return Array.from(this.checklistItems.values())
      .filter((item) => item.taskId === taskId)
      .sort((left, right) => {
        const a = left.position instanceof Prisma.Decimal ? left.position.toNumber() : Number(left.position);
        const b = right.position instanceof Prisma.Decimal ? right.position.toNumber() : Number(right.position);
        return a - b;
      })
      .map((item) => cloneChecklistItem(item));
  };

  private formatChecklistSelection = (
    taskId: string,
    selection?: boolean | Prisma.TaskChecklistItemFindManyArgs
  ): unknown => {
    const items = this.getChecklistItemsForTask(taskId);
    if (!selection || selection === true) {
      return items;
    }
    const select = 'select' in selection && selection.select ? selection.select : null;
    if (!select) {
      return items;
    }
    const keys = Object.entries(select).filter(([, include]) => include);
    return items.map((item) => {
      const projected: Record<string, unknown> = {};
      keys.forEach(([key]) => {
        projected[key] = (item as Record<string, unknown>)[key];
      });
      return projected;
    });
  };

  private presentTask = (record: Task, select?: Prisma.TaskSelect): unknown => {
    const base = cloneTask(record);
    if (!select) {
      return {
        ...base,
        checklistItems: this.getChecklistItemsForTask(record.id)
      };
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(select)) {
      if (!value) {
        continue;
      }
      if (key === 'checklistItems') {
        result.checklistItems = this.formatChecklistSelection(record.id, value === true ? true : (value as Prisma.TaskChecklistItemFindManyArgs));
        continue;
      }
      result[key] = (base as Record<string, unknown>)[key];
    }
    if (select.checklistItems && result.checklistItems === undefined) {
      result.checklistItems = this.formatChecklistSelection(
        record.id,
        select.checklistItems === true ? true : (select.checklistItems as Prisma.TaskChecklistItemFindManyArgs)
      );
    }
    return result;
  };

  private taskCreate = async (args: Prisma.TaskCreateArgs): Promise<unknown> => {
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
    return this.presentTask(record, args.select ?? undefined);
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
    if (args.select?.id && Object.keys(args.select).length === 1 && !args.select.checklistItems) {
      return sliced.map((record) => ({ id: record.id }));
    }
    return sliced.map((record) => this.presentTask(record, args.select ?? undefined));
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

  private taskFindUnique = async (args: Prisma.TaskFindUniqueArgs): Promise<unknown> => {
    if (!args.where?.id) {
      return null;
    }
    const match = this.tasks.get(args.where.id);
    return match ? this.presentTask(match, args.select ?? undefined) : null;
  };

  private taskUpdate = async (args: Prisma.TaskUpdateArgs): Promise<unknown> => {
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
    return this.presentTask(updated, args.select ?? undefined);
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
    for (const [id, item] of this.checklistItems.entries()) {
      if (item.taskId === existing.id) {
        this.checklistItems.delete(id);
      }
    }
    return cloneTask(existing);
  };

  private checklistFindMany = async (args: Prisma.TaskChecklistItemFindManyArgs): Promise<TaskChecklistItem[]> => {
    const filtered = Array.from(this.checklistItems.values()).filter((record) => matchChecklistItem(args.where, record));
    const ordered = filtered.sort((left, right) => {
      const a = left.position instanceof Prisma.Decimal ? left.position.toNumber() : Number(left.position);
      const b = right.position instanceof Prisma.Decimal ? right.position.toNumber() : Number(right.position);
      return a - b;
    });
    const start = args.skip ?? 0;
    const end = args.take ? start + args.take : undefined;
    return ordered.slice(start, end).map((item) => cloneChecklistItem(item));
  };

  private checklistCreate = async (args: Prisma.TaskChecklistItemCreateArgs): Promise<TaskChecklistItem> => {
    const record: TaskChecklistItem = {
      id: crypto.randomUUID(),
      taskId: args.data.taskId,
      label: args.data.label,
      position:
        args.data.position instanceof Prisma.Decimal ? args.data.position : new Prisma.Decimal(args.data.position ?? 0),
      completedAt: args.data.completedAt ?? null,
      createdAt: now(),
      updatedAt: now()
    };
    this.checklistItems.set(record.id, record);
    return cloneChecklistItem(record);
  };

  private checklistUpdate = async (args: Prisma.TaskChecklistItemUpdateArgs): Promise<TaskChecklistItem> => {
    if (!args.where.id) {
      throw new Error('Checklist item identifier required');
    }
    const existing = this.checklistItems.get(args.where.id);
    if (!existing) {
      throw new Error('Checklist item not found');
    }
    const updated: TaskChecklistItem = {
      ...existing,
      label: args.data.label ?? existing.label,
      completedAt: Object.prototype.hasOwnProperty.call(args.data, 'completedAt')
        ? ((args.data.completedAt as Date | null | undefined) ?? null)
        : existing.completedAt,
      position:
        args.data.position instanceof Prisma.Decimal
          ? args.data.position
          : args.data.position
            ? new Prisma.Decimal(args.data.position)
            : existing.position,
      updatedAt: now()
    };
    this.checklistItems.set(updated.id, updated);
    return cloneChecklistItem(updated);
  };

  private checklistDelete = async (args: Prisma.TaskChecklistItemDeleteArgs): Promise<TaskChecklistItem> => {
    if (!args.where.id) {
      throw new Error('Checklist item identifier required');
    }
    const existing = this.checklistItems.get(args.where.id);
    if (!existing) {
      throw new Error('Checklist item not found');
    }
    this.checklistItems.delete(existing.id);
    return cloneChecklistItem(existing);
  };

  private checklistDeleteMany = async (args: Prisma.TaskChecklistItemDeleteManyArgs): Promise<{ count: number }> => {
    const entries = Array.from(this.checklistItems.values()).filter((record) => matchChecklistItem(args.where, record));
    entries.forEach((entry) => {
      this.checklistItems.delete(entry.id);
    });
    return { count: entries.length };
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
        findUnique: this.membershipFindUnique,
        update: this.membershipUpdate,
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
      taskChecklistItem: {
        deleteMany: async () => ({ count: 0 })
      },
      comment: {
        deleteMany: this.commentDeleteMany
      },
      attachment: {
        deleteMany: this.attachmentDeleteMany
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
