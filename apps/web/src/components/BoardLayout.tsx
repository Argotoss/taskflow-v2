import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useAuth } from '../auth/useAuth.js';
import Modal from './Modal.js';
import AuthPanel from '../auth/components/AuthPanel.js';
import type { TaskSummary, WorkspaceSummary, ProjectSummary, TaskPriority, MembershipSummary } from '@taskflow/types';
import { workspaceApi } from '../workspaces/workspaceApi.js';
import { projectApi } from '../projects/projectApi.js';
import { tasksApi } from '../tasks/taskApi.js';
import { ApiError } from '../api/httpClient.js';
import TaskDetailModal from '../tasks/components/TaskDetailModal.js';
import InboxPanel from '../notifications/components/InboxPanel.js';
import Select from './Select.js';

type TaskStatus = TaskSummary['status'];

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  action: 'PROFILE' | 'PROJECT' | 'INVITE' | 'TASK';
}

const columnDefinitions: Array<{ status: TaskStatus; title: string; description: string; className: string }> = [
  { status: 'TODO', title: 'Backlog', description: 'Ideas and new requests', className: 'backlog' },
  { status: 'IN_PROGRESS', title: 'In Progress', description: 'Work underway', className: 'in-progress' },
  { status: 'IN_REVIEW', title: 'In Review', description: 'Ready for review', className: 'review' },
  { status: 'BLOCKED', title: 'Blocked', description: 'Waiting for input', className: 'blocked' },
  { status: 'COMPLETED', title: 'Done', description: 'Completed work', className: 'done' }
];

const statusOrder: TaskStatus[] = columnDefinitions.map((column) => column.status);

const createEmptyBoard = (): Record<TaskStatus, TaskSummary[]> => ({
  TODO: [],
  IN_PROGRESS: [],
  IN_REVIEW: [],
  BLOCKED: [],
  COMPLETED: []
});

const cloneBoard = (board: Record<TaskStatus, TaskSummary[]>): Record<TaskStatus, TaskSummary[]> => {
  const copy = createEmptyBoard();
  statusOrder.forEach((status) => {
    copy[status] = board[status].map((task) => ({ ...task }));
  });
  return copy;
};

const priorityOrder: TaskPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const priorityLabels: Record<TaskPriority, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low'
};
type DueFilter = 'ALL' | 'OVERDUE' | 'DUE_SOON' | 'NO_DUE_DATE';

const lowercaseAlphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
const uppercaseAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const randomSegment = (length: number, characters: string): string => {
  if (length <= 0) {
    return '';
  }
  const cryptoSource = typeof crypto !== 'undefined' ? crypto : undefined;
  if (cryptoSource?.getRandomValues) {
    const values = cryptoSource.getRandomValues(new Uint32Array(length));
    let output = '';
    for (let index = 0; index < length; index += 1) {
      output += characters[values[index] % characters.length];
    }
    return output;
  }
  let fallback = '';
  for (let index = 0; index < length; index += 1) {
    fallback += characters[Math.floor(Math.random() * characters.length)];
  }
  return fallback;
};

const toSlug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');

const buildWorkspaceDefaults = (userName?: string): { name: string; slug: string } => {
  const trimmed = userName?.trim() ?? '';
  const rootName = trimmed.length > 0 ? `${trimmed.split(' ')[0]}'s workspace` : 'Team workspace';
  const slugBase = toSlug(trimmed) || 'workspace';
  const suffix = randomSegment(6, lowercaseAlphabet);
  return {
    name: rootName,
    slug: `${slugBase}-${suffix}`
  };
};

const buildProjectDefaults = (workspaceName?: string): { name: string; key: string } => {
  const trimmed = workspaceName?.trim() ?? '';
  const projectName = trimmed.length > 0 ? `${trimmed} Board` : 'Workspace Board';
  const key = `TF${randomSegment(3, uppercaseAlphabet)}`;
  return {
    name: projectName,
    key
  };
};

const getInitials = (name?: string, email?: string): string => {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  if (email) {
    return email.slice(0, 2).toUpperCase();
  }

  return 'TF';
};

const BoardLayout = (): JSX.Element => {
  const auth = useAuth();
  const accessToken = auth.session?.tokens.accessToken ?? null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskColumn, setTaskColumn] = useState<TaskStatus>('TODO');
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<MembershipSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [boardTasks, setBoardTasks] = useState<Record<TaskStatus, TaskSummary[]>>(createEmptyBoard);
  const [hiddenColumns, setHiddenColumns] = useState<TaskStatus[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<'ALL' | 'UNASSIGNED' | string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority[]>(priorityOrder);
  const [dueFilter, setDueFilter] = useState<DueFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskModalSubmitting, setTaskModalSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSyncNotice, setShowSyncNotice] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState<TaskSummary | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxSummary, setInboxSummary] = useState({ unreadNotifications: 0, pendingInvites: 0 });
  const workspaceEnsuredRef = useRef(false);
  const projectEnsuredRef = useRef<Record<string, boolean>>({});
  const syncNoticeDelayRef = useRef<number | null>(null);
  const selectIdPrefix = useId();

  const initials = useMemo(() => getInitials(auth.user?.name, auth.user?.email), [auth.user?.email, auth.user?.name]);
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );
  const totalTaskCount = useMemo(
    () => statusOrder.reduce((sum, status) => sum + boardTasks[status].length, 0),
    [boardTasks]
  );

  const boardSubtitle = useMemo(() => {
    if (loadingWorkspaces) {
      return 'Loading workspaces…';
    }
    if (!activeWorkspace) {
      return 'Create a workspace to start organizing work.';
    }
    if (loadingProjects) {
      return 'Loading projects…';
    }
    if (!activeProject) {
      return projects.length === 0 ? 'Create a project to start planning work.' : 'Select a project to view tasks.';
    }
    if (loadingTasks) {
      return 'Loading tasks…';
    }
    return `Drag and drop tasks to update status. ${totalTaskCount === 1 ? '1 task on this board.' : `${totalTaskCount} tasks on this board.`}`;
  }, [
    activeWorkspace,
    activeProject,
    loadingWorkspaces,
    loadingProjects,
    loadingTasks,
    projects.length,
    totalTaskCount
  ]);

  const onboardingSteps = useMemo<OnboardingStep[]>(() => {
    const profileCompleted =
      (typeof auth.user?.avatarUrl === 'string' && auth.user.avatarUrl.trim().length > 0) ||
      (typeof auth.user?.timezone === 'string' && auth.user.timezone.trim().length > 0);
    const hasProject = projects.length > 0;
    const teammateCount = workspaceMembers.filter((member) => member.userId !== auth.user?.id).length;
    const taskCount = totalTaskCount;
    return [
      {
        id: 'profile',
        title: 'Complete your profile',
        description: 'Add an avatar or timezone so teammates recognize you.',
        completed: profileCompleted,
        action: 'PROFILE'
      },
      {
        id: 'project',
        title: 'Launch your first project',
        description: 'Create or select a project to organise work.',
        completed: hasProject,
        action: 'PROJECT'
      },
      {
        id: 'invite',
        title: 'Invite a teammate',
        description: 'Share your workspace with collaborators.',
        completed: teammateCount > 0,
        action: 'INVITE'
      },
      {
        id: 'task',
        title: 'Add your first task',
        description: 'Capture work items to keep momentum.',
        completed: taskCount > 0,
        action: 'TASK'
      }
    ];
  }, [auth.user?.avatarUrl, auth.user?.id, auth.user?.timezone, projects.length, totalTaskCount, workspaceMembers]);

  const hiddenColumnSet = useMemo(() => new Set<TaskStatus>(hiddenColumns), [hiddenColumns]);
  const filtersActive = useMemo(
    () =>
      assigneeFilter !== 'ALL' ||
      priorityFilter.length !== priorityOrder.length ||
      dueFilter !== 'ALL' ||
      searchQuery.trim().length > 0,
    [assigneeFilter, priorityFilter, dueFilter, searchQuery]
  );

  const inboxBadge = useMemo(
    () => inboxSummary.unreadNotifications + inboxSummary.pendingInvites,
    [inboxSummary.pendingInvites, inboxSummary.unreadNotifications]
  );
  const visibleBoard = useMemo(() => {
    const now = Date.now();
    const soonThreshold = now + 7 * 24 * 60 * 60 * 1000;
    const prioritySet = new Set<TaskPriority>(priorityFilter);
    const trimmedQuery = searchQuery.trim().toLowerCase();
    const filtered = createEmptyBoard();
    statusOrder.forEach((status) => {
      filtered[status] = boardTasks[status].filter((task) => {
        const assigneeMatches =
          assigneeFilter === 'ALL'
            ? true
            : assigneeFilter === 'UNASSIGNED'
              ? task.assigneeId === null
              : task.assigneeId === assigneeFilter;
        if (!assigneeMatches) {
          return false;
        }
        if (!prioritySet.has(task.priority)) {
          return false;
        }
        if (trimmedQuery.length > 0) {
          const inTitle = task.title.toLowerCase().includes(trimmedQuery);
          const inDescription = task.description ? task.description.toLowerCase().includes(trimmedQuery) : false;
          if (!inTitle && !inDescription) {
            return false;
          }
        }
        if (dueFilter === 'ALL') {
          return true;
        }
        if (dueFilter === 'NO_DUE_DATE') {
          return task.dueDate === null;
        }
        if (!task.dueDate) {
          return false;
        }
        const dueTime = new Date(task.dueDate).getTime();
        if (Number.isNaN(dueTime)) {
          return false;
        }
        if (dueFilter === 'OVERDUE') {
          return dueTime < now;
        }
        if (dueFilter === 'DUE_SOON') {
          return dueTime >= now && dueTime <= soonThreshold;
        }
        return true;
      });
    });
    return filtered;
  }, [assigneeFilter, boardTasks, dueFilter, priorityFilter, searchQuery]);
  const filteredTaskCount = useMemo(
    () => statusOrder.reduce((sum, status) => sum + visibleBoard[status].length, 0),
    [visibleBoard]
  );

  useEffect(() => {
    if (!infoMessage || typeof window === 'undefined') {
      return;
    }
    const timeout = window.setTimeout(() => {
      setInfoMessage(null);
    }, 4000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [infoMessage]);

  useEffect(() => {
    if (!accessToken) {
      setWorkspaces([]);
      setProjects([]);
      setSelectedWorkspaceId(null);
      setSelectedProjectId(null);
      setBoardTasks(createEmptyBoard());
      workspaceEnsuredRef.current = false;
      projectEnsuredRef.current = {};
      return;
    }

    let cancelled = false;

    const loadWorkspaces = async (): Promise<void> => {
      setLoadingWorkspaces(true);
      setErrorMessage(null);
      try {
        let data = await workspaceApi.list(accessToken);
        if (data.length === 0 && !workspaceEnsuredRef.current) {
          const defaults = buildWorkspaceDefaults(auth.user?.name);
          const created = await workspaceApi.create(accessToken, {
            name: defaults.name,
            slug: defaults.slug,
            description: null
          });
          data = [created];
          setInfoMessage('Created a starter workspace so you can begin right away.');
        }
        if (cancelled) {
          return;
        }
        if (data.length === 0) {
          setWorkspaces([]);
          setProjects([]);
          setSelectedWorkspaceId(null);
          setSelectedProjectId(null);
          setBoardTasks(createEmptyBoard());
          return;
        }
        workspaceEnsuredRef.current = true;
        setWorkspaces(data);
        setSelectedWorkspaceId((current) => {
          if (current && data.some((workspace) => workspace.id === current)) {
            return current;
          }
          return data[0].id;
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof ApiError ? error.message : 'Failed to load workspaces');
          workspaceEnsuredRef.current = false;
          setWorkspaces([]);
          setProjects([]);
          setSelectedWorkspaceId(null);
          setSelectedProjectId(null);
          setBoardTasks(createEmptyBoard());
        }
      } finally {
        if (!cancelled) {
          setLoadingWorkspaces(false);
        }
      }
    };

    void loadWorkspaces();

    return () => {
      cancelled = true;
    };
  }, [accessToken, auth.user?.name]);

  useEffect(() => {
    if (!accessToken || !selectedWorkspaceId) {
      setProjects([]);
      setSelectedProjectId(null);
      setBoardTasks(createEmptyBoard());
      return;
    }

    let cancelled = false;

    const loadProjects = async (): Promise<void> => {
      setLoadingProjects(true);
      setErrorMessage(null);
      setBoardTasks(createEmptyBoard());
      try {
        let data = await projectApi.list(accessToken, selectedWorkspaceId);
        if (data.length === 0 && !projectEnsuredRef.current[selectedWorkspaceId]) {
          const workspaceName = workspaces.find((workspace) => workspace.id === selectedWorkspaceId)?.name;
          const defaults = buildProjectDefaults(workspaceName);
          const project = await projectApi.create(accessToken, selectedWorkspaceId, {
            name: defaults.name,
            key: defaults.key,
            description: null
          });
          data = [project];
          projectEnsuredRef.current = {
            ...projectEnsuredRef.current,
            [selectedWorkspaceId]: true
          };
          setInfoMessage('Created a starter project for your workspace.');
        } else if (data.length > 0) {
          projectEnsuredRef.current = {
            ...projectEnsuredRef.current,
            [selectedWorkspaceId]: true
          };
        }
        if (cancelled) {
          return;
        }
        if (data.length === 0) {
          setProjects([]);
          setSelectedProjectId(null);
          setBoardTasks(createEmptyBoard());
          return;
        }
        setProjects(data);
        setSelectedProjectId((current) => {
          if (current && data.some((project) => project.id === current)) {
            return current;
          }
          return data[0].id;
        });
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof ApiError ? error.message : 'Failed to load projects');
          setProjects([]);
          setSelectedProjectId(null);
          setBoardTasks(createEmptyBoard());
          projectEnsuredRef.current = {
            ...projectEnsuredRef.current,
            [selectedWorkspaceId]: false
          };
        }
      } finally {
        if (!cancelled) {
          setLoadingProjects(false);
        }
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedWorkspaceId, workspaces]);

  useEffect(() => {
    if (!accessToken || !selectedWorkspaceId) {
      setWorkspaceMembers([]);
      return;
    }
    let cancelled = false;
    workspaceApi
      .members(accessToken, selectedWorkspaceId)
      .then((data) => {
        if (!cancelled) {
          const sorted = [...data].sort((left, right) => {
            const leftName = left.user.name ?? left.user.email;
            const rightName = right.user.name ?? right.user.email;
            return leftName.localeCompare(rightName, undefined, { sensitivity: 'base' });
          });
          setWorkspaceMembers(sorted);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkspaceMembers([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedWorkspaceId]);

  useEffect(() => {
    if (!accessToken || !selectedProjectId) {
      setBoardTasks(createEmptyBoard());
      return;
    }

    let cancelled = false;

    const loadTasks = async (): Promise<void> => {
      setLoadingTasks(true);
      setErrorMessage(null);
      try {
        const data = await tasksApi.list(accessToken, selectedProjectId);
        if (cancelled) {
          return;
        }
        const grouped = createEmptyBoard();
        data.forEach((task) => {
          const status = statusOrder.includes(task.status) ? task.status : 'TODO';
          grouped[status].push(task);
        });
        statusOrder.forEach((status) => {
          grouped[status].sort((a, b) => a.sortOrder - b.sortOrder);
        });
        setBoardTasks(grouped);
        let detailRemoved = false;
        setTaskDetail((current) => {
          if (!current) {
            return current;
          }
          const refreshed = data.find((item) => item.id === current.id) ?? null;
          if (!refreshed) {
            detailRemoved = true;
            return null;
          }
          return refreshed;
        });
        if (detailRemoved) {
          setTaskDetailOpen(false);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof ApiError ? error.message : 'Failed to load tasks');
          setBoardTasks(createEmptyBoard());
        }
      } finally {
        if (!cancelled) {
          setLoadingTasks(false);
        }
      }
    };

    loadTasks();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedProjectId]);

  useEffect(() => {
    setHiddenColumns([]);
    setAssigneeFilter('ALL');
    setPriorityFilter(priorityOrder);
    setDueFilter('ALL');
    setSearchQuery('');
  }, [selectedProjectId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      if (!syncing) {
        setShowSyncNotice(false);
      }
      return;
    }

    if (syncNoticeDelayRef.current !== null) {
      window.clearTimeout(syncNoticeDelayRef.current);
      syncNoticeDelayRef.current = null;
    }

    if (!syncing) {
      setShowSyncNotice(false);
      return;
    }

    setShowSyncNotice(false);
    const timeoutId = window.setTimeout(() => {
      setShowSyncNotice(true);
      syncNoticeDelayRef.current = null;
    }, 220);
    syncNoticeDelayRef.current = timeoutId;

    return () => {
      if (syncNoticeDelayRef.current !== null) {
        window.clearTimeout(syncNoticeDelayRef.current);
        syncNoticeDelayRef.current = null;
      }
    };
  }, [syncing]);

  const persistBoardState = async (
    projectId: string,
    token: string,
    board: Record<TaskStatus, TaskSummary[]>
  ): Promise<void> => {
    const columns = columnDefinitions.map((column) => ({
      status: column.status,
      taskIds: board[column.status].map((task) => task.id)
    }));
    await tasksApi.reorder(token, projectId, columns);
  };

  const runBoardMutation = async (
    next: Record<TaskStatus, TaskSummary[]>,
    previous: Record<TaskStatus, TaskSummary[]>,
    options: { sideEffect?: () => Promise<void>; projectId?: string | null; token?: string | null } = {}
  ): Promise<void> => {
    setBoardTasks(next);
    const token = options.token ?? accessToken;
    const projectId = options.projectId ?? selectedProjectId;
    if (!token || !projectId) {
      return;
    }
    setErrorMessage(null);
    setSyncing(true);
    try {
      if (options.sideEffect) {
        await options.sideEffect();
      }
      await persistBoardState(projectId, token, next);
    } catch (error) {
      setBoardTasks(previous);
      setErrorMessage(error instanceof ApiError ? error.message : 'Unable to save board changes');
      throw error;
    } finally {
      setSyncing(false);
    }
  };

  const hideColumn = (status: TaskStatus): void => {
    setHiddenColumns((current) => (current.includes(status) ? current : [...current, status]));
  };

  const showColumn = (status: TaskStatus): void => {
    setHiddenColumns((current) => current.filter((entry) => entry !== status));
  };

  const resetTaskModal = (): void => {
    setTaskTitle('');
    setTaskDescription('');
    setTaskColumn('TODO');
  };

  const openTaskDetail = (task: TaskSummary): void => {
    setTaskDetail(task);
    setTaskDetailOpen(true);
  };

  const closeTaskDetail = (): void => {
    setTaskDetailOpen(false);
    setTaskDetail(null);
  };

  const applyTaskSnapshot = (updated: TaskSummary): void => {
    setBoardTasks((current) => {
      const next = cloneBoard(current);
      statusOrder.forEach((status) => {
        next[status] = next[status].filter((entry) => entry.id !== updated.id);
      });
      const targetStatus = statusOrder.includes(updated.status) ? updated.status : 'TODO';
      next[targetStatus] = [...next[targetStatus], updated].sort((a, b) => a.sortOrder - b.sortOrder);
      return next;
    });
    setTaskDetail((current) => (current && current.id === updated.id ? updated : current));
  };

  const handleTaskUpdatedFromModal = (updated: TaskSummary): void => {
    applyTaskSnapshot(updated);
    setInfoMessage('Task updated');
  };

  const openTaskModal = (status: TaskStatus): void => {
    if (!selectedProjectId || !accessToken) {
      setInfoMessage('Select a workspace and project before adding tasks.');
      return;
    }
    resetTaskModal();
    setTaskColumn(status);
    setTaskModalOpen(true);
  };

  const handleTaskSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedProjectId || !accessToken) {
      return;
    }
    const trimmedTitle = taskTitle.trim();
    if (trimmedTitle.length === 0 || taskModalSubmitting) {
      return;
    }

    setTaskModalSubmitting(true);
    setErrorMessage(null);

    let created: TaskSummary;
    try {
      created = await tasksApi.create(accessToken, selectedProjectId, {
        title: trimmedTitle,
        description: taskDescription.trim().length > 0 ? taskDescription.trim() : null,
        status: taskColumn
      });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Unable to create task');
      setTaskModalSubmitting(false);
      return;
    }

    const previous = cloneBoard(boardTasks);
    const next = cloneBoard(boardTasks);
    next[created.status].push(created);

    try {
      await runBoardMutation(next, previous);
      setTaskModalOpen(false);
      resetTaskModal();
    } catch {
      // noop, message handled in runBoardMutation
    } finally {
      setTaskModalSubmitting(false);
    }
  };

  const handleTaskRemove = async (taskId: string, status: TaskStatus): Promise<void> => {
    if (!selectedProjectId || !accessToken || syncing || loadingTasks) {
      return;
    }

    const previous = cloneBoard(boardTasks);
    const next = cloneBoard(boardTasks);
    next[status] = next[status].filter((task) => task.id !== taskId);
    try {
      await runBoardMutation(next, previous, {
        sideEffect: () => tasksApi.remove(accessToken, taskId)
      });
      if (taskDetail?.id === taskId) {
        closeTaskDetail();
      }
      setInfoMessage('Task removed');
    } catch {
      // errors handled in runBoardMutation
    }
  };

  const handleTaskDeletedFromModal = async (task: TaskSummary): Promise<void> => {
    await handleTaskRemove(task.id, task.status);
    closeTaskDetail();
  };

  const handleDragEnd = ({ source, destination }: DropResult): void => {
    if (
      !destination ||
      !selectedProjectId ||
      !accessToken ||
      syncing ||
      loadingTasks ||
      filtersActive
    ) {
      return;
    }

    const startColumn = source.droppableId as TaskStatus;
    const finishColumn = destination.droppableId as TaskStatus;

    if (startColumn === finishColumn && source.index === destination.index) {
      return;
    }

    const previous = cloneBoard(boardTasks);
    const next = cloneBoard(boardTasks);
    const sourceTasks = next[startColumn];
    const [movedTask] = sourceTasks.splice(source.index, 1);
    if (!movedTask) {
      return;
    }

    const taskToInsert = startColumn === finishColumn ? movedTask : { ...movedTask, status: finishColumn };
    next[finishColumn].splice(destination.index, 0, taskToInsert);
    void runBoardMutation(next, previous);
  };

  const workspaceValue = selectedWorkspaceId ?? '';
  const projectValue = selectedProjectId ?? '';
  const assigneeOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Everyone' },
      { value: 'UNASSIGNED', label: 'Unassigned' },
      ...workspaceMembers.map((member) => ({
        value: member.userId,
        label: member.user.name ?? member.user.email
      }))
    ],
    [workspaceMembers]
  );
  const dueFilterOptions = useMemo(
    () => [
      { value: 'ALL' as DueFilter, label: 'Any' },
      { value: 'OVERDUE' as DueFilter, label: 'Overdue' },
      { value: 'DUE_SOON' as DueFilter, label: 'Due in 7 days' },
      { value: 'NO_DUE_DATE' as DueFilter, label: 'No due date' }
    ],
    []
  );
  const taskStatusSelectOptions = useMemo(
    () => columnDefinitions.map((column) => ({ value: column.status, label: column.title })),
    []
  );
  const visualSyncing = syncing && showSyncNotice;
  const canMutateBoard =
    Boolean(selectedProjectId && accessToken) && !loadingTasks && !loadingProjects && !loadingWorkspaces;

  return (
    <div className="app-shell">
      <main className="app-shell__main">
        <header className="board-header">
          <div>
            <h1>{activeWorkspace ? activeWorkspace.name : 'Workspace board'}</h1>
            <p>{boardSubtitle}</p>
          </div>
          <div className="board-header__actions">
            {activeProject ? (
              <div className="board-header__summary" aria-live="polite">
                <span className="board-header__summary-label">Total tasks</span>
                <span className="board-header__summary-value">
                  {filtersActive ? `${filteredTaskCount}/${totalTaskCount}` : totalTaskCount}
                </span>
              </div>
            ) : null}
            <div className="board-header__selectors">
              <label htmlFor={`${selectIdPrefix}-workspace`}>
                <span>Workspace</span>
                <Select
                  id={`${selectIdPrefix}-workspace`}
                  value={workspaceValue}
                  onChange={(next) => setSelectedWorkspaceId(next.length === 0 ? null : next)}
                  options={workspaces.map((workspace) => ({ value: workspace.id, label: workspace.name }))}
                  disabled={loadingWorkspaces || visualSyncing || workspaces.length === 0}
                  placeholder={workspaces.length === 0 ? 'No workspaces' : 'Select workspace'}
                  fullWidth
                />
              </label>
              <label htmlFor={`${selectIdPrefix}-project`}>
                <span>Project</span>
                <Select
                  id={`${selectIdPrefix}-project`}
                  value={projectValue}
                  onChange={(next) => setSelectedProjectId(next.length === 0 ? null : next)}
                  options={projects.map((project) => ({ value: project.id, label: project.name }))}
                  disabled={loadingProjects || visualSyncing || projects.length === 0}
                  placeholder={projects.length === 0 ? 'No projects' : 'Select project'}
                  fullWidth
                />
              </label>
            </div>
            <button
              type="button"
              className={`board-button board-button--ghost board-button--inbox${inboxBadge > 0 ? ' board-button--inbox-active' : ''}`}
              onClick={() => setInboxOpen(true)}
            >
              Inbox
              {inboxBadge > 0 ? <span className="board-button__pill">{inboxBadge}</span> : null}
            </button>
            <button
              type="button"
              className="board-button board-button--ghost"
              onClick={() => openTaskModal('TODO')}
              disabled={!canMutateBoard}
            >
              New task
            </button>
            <button type="button" className="board-avatar" onClick={() => setSettingsOpen(true)}>
              <span>{initials}</span>
            </button>
          </div>
        </header>

        <section className="board-filters" aria-label="Task filters">
          {activeProject ? (
            <div className="board-filters__grid">
              <div className="board-filters__group board-filters__group--search">
                <label className="board-field-label" htmlFor={`${selectIdPrefix}-search`}>
                  <span>Search</span>
                  <input
                    id={`${selectIdPrefix}-search`}
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by title or description"
                  />
                </label>
              </div>
              <div className="board-filters__group">
                <label className="board-field-label" htmlFor={`${selectIdPrefix}-assignee`}>
                  <span>Assignee</span>
                  <Select
                    id={`${selectIdPrefix}-assignee`}
                    value={assigneeFilter}
                    onChange={(next) => setAssigneeFilter(next as typeof assigneeFilter)}
                    options={assigneeOptions}
                    placeholder="Filter by assignee"
                    fullWidth
                  />
                </label>
              </div>
              <div className="board-filters__group">
                <label className="board-field-label" htmlFor={`${selectIdPrefix}-due`}>
                  <span>Due date</span>
                  <Select
                    id={`${selectIdPrefix}-due`}
                    value={dueFilter}
                    onChange={(next) => setDueFilter(next as DueFilter)}
                    options={dueFilterOptions}
                    placeholder="Any due date"
                    fullWidth
                  />
                </label>
              </div>
              <div className="board-filters__group board-filters__group--priority">
                <label className="board-field-label">
                  <span>Priority</span>
                  <div className="board-filters__chips">
                    {priorityOrder.map((priority) => {
                      const selected = priorityFilter.includes(priority);
                      return (
                        <button
                          key={priority}
                          type="button"
                          className={`board-filters__chip${selected ? ' board-filters__chip--active' : ''}`}
                          onClick={() =>
                            setPriorityFilter((current) => {
                              if (selected) {
                                const next = current.filter((entry) => entry !== priority);
                                return next.length === 0 ? priorityOrder : next;
                              }
                              const nextSet = new Set([...current, priority]);
                              return priorityOrder.filter((value) => nextSet.has(value));
                            })
                          }
                          aria-pressed={selected}
                        >
                          {priorityLabels[priority]}
                        </button>
                      );
                    })}
                  </div>
                </label>
              </div>
              {filtersActive ? (
                <div className="board-filters__group board-filters__group--clear">
                  <button
                    type="button"
                    className="board-filters__clear"
                    onClick={() => {
                      setAssigneeFilter('ALL');
                      setPriorityFilter(priorityOrder);
                      setDueFilter('ALL');
                    }}
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="board-filters__notice">Select a project to enable task filters.</p>
          )}
        </section>

        {errorMessage && <div className="board-feedback board-feedback--error">{errorMessage}</div>}
        {infoMessage && <div className="board-feedback board-feedback--info">{infoMessage}</div>}
  {visualSyncing && !loadingTasks && <div className="board-feedback board-feedback--info">Saving changes…</div>}

        <DragDropContext onDragEnd={handleDragEnd}>
          <section className="board-columns" aria-label="Workspace board">
            {columnDefinitions.map((column) => {
              const columnHidden = hiddenColumnSet.has(column.status);
              const columnInteractionsDisabled = columnHidden || !canMutateBoard || visualSyncing;
              const dropDisabled = columnInteractionsDisabled || filtersActive;
              const visibleTasks = visibleBoard[column.status];
              const totalTasks = boardTasks[column.status].length;
              const columnCountLabel = filtersActive ? `${visibleTasks.length}/${totalTasks}` : `${visibleTasks.length}`;
              return (
                <Droppable droppableId={column.status} key={column.status} isDropDisabled={dropDisabled}>
                  {(provided, snapshot) => (
                    <article
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`board-column board-column--${column.className} ${
                        snapshot.isDraggingOver ? 'board-column--dragging-over' : ''
                      } ${columnHidden ? 'board-column--hidden' : ''}`}
                    >
                      <header className="board-column__header">
                        <h2>{column.title}</h2>
                        <div className="board-column__header-actions">
                          <span className="board-column__count">{columnCountLabel}</span>
                          <button
                            type="button"
                            className="board-column__add-icon"
                            onClick={() => openTaskModal(column.status)}
                            disabled={columnInteractionsDisabled}
                            aria-label={`Add task to ${column.title}`}
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="board-column__toggle"
                            onClick={() => (columnHidden ? showColumn(column.status) : hideColumn(column.status))}
                            aria-pressed={!columnHidden}
                          >
                            {columnHidden ? 'Show' : 'Hide'}
                          </button>
                        </div>
                      </header>
                      <p className="board-column__description">{column.description}</p>
                      {columnHidden ? (
                        <div className="board-column__hidden" aria-live="polite">
                          <span>Column hidden</span>
                          <button type="button" onClick={() => showColumn(column.status)}>
                            Show column
                          </button>
                        </div>
                      ) : visibleTasks.length === 0 ? (
                        totalTasks === 0 ? (
                          <div className="board-column__empty">No tasks yet. Add one to get started.</div>
                        ) : (
                          <div className="board-column__empty board-column__empty--filtered">No tasks match the current filters.</div>
                        )
                      ) : (
                        <div className="board-column__tasks">
                          {visibleTasks.map((task, index) => (
                            <Draggable draggableId={task.id} index={index} key={task.id} isDragDisabled={filtersActive || columnInteractionsDisabled}>
                              {(dragProvided, dragSnapshot) => (
                                <article
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  className={`board-task board-task--${column.className} ${
                                    dragSnapshot.isDragging ? 'board-task--dragging' : ''
                                  }`}
                                >
                                  <div
                                    className="board-task__content"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => openTaskDetail(task)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openTaskDetail(task);
                                      }
                                    }}
                                    aria-label={`View details for ${task.title}`}
                                  >
                                    <h3>{task.title}</h3>
                                    {task.description && <p>{task.description}</p>}
                                    {task.checklistTotalCount > 0 ? (
                                      <span className="board-task__meta">
                                        Checklist {task.checklistCompletedCount}/{task.checklistTotalCount}
                                      </span>
                                    ) : null}
                                    <span className="board-task__meta">Added {new Date(task.createdAt).toLocaleString()}</span>
                                  </div>
                                  <div
                                    className="board-task__actions"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                    }}
                                    onKeyDown={(event) => {
                                      event.stopPropagation();
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="board-task__action board-task__action--edit"
                                      onClick={() => openTaskDetail(task)}
                                      disabled={visualSyncing}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      className="board-task__action board-task__action--remove"
                                      onClick={() => handleTaskRemove(task.id, column.status)}
                                      disabled={!canMutateBoard || visualSyncing}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </article>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </article>
                  )}
                </Droppable>
              );
            })}
          </section>
        </DragDropContext>
      </main>

      <TaskDetailModal
        open={taskDetailOpen}
        task={taskDetail}
        accessToken={accessToken}
        canEdit={canMutateBoard && !visualSyncing}
        statusOptions={columnDefinitions.map((column) => ({ status: column.status, title: column.title }))}
        onClose={closeTaskDetail}
        onTaskUpdated={handleTaskUpdatedFromModal}
        onTaskDeleted={handleTaskDeletedFromModal}
      />

      <Modal open={inboxOpen} onClose={() => setInboxOpen(false)} title="Inbox">
        <InboxPanel
          accessToken={accessToken}
          steps={onboardingSteps}
          onCountsChange={(summary) => {
            setInboxSummary(summary);
          }}
          onRequestSettings={() => {
            setInboxOpen(false);
            setSettingsOpen(true);
          }}
          onRequestNewTask={() => {
            setInboxOpen(false);
            openTaskModal('TODO');
          }}
        />
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Account & Workspace">
        <AuthPanel />
      </Modal>

      <Modal
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          resetTaskModal();
        }}
        title="Create task"
        footer={
          <div className="modal__footer-actions">
            <button type="button" className="board-button board-button--ghost" onClick={() => setTaskModalOpen(false)} disabled={taskModalSubmitting}>
              Cancel
            </button>
            <button type="submit" form="task-form" className="board-button" disabled={taskModalSubmitting}>
              Add task
            </button>
          </div>
        }
      >
        <form id="task-form" className="task-form" onSubmit={handleTaskSubmit}>
          <label className="task-form__field">
            <span>Title</span>
            <input
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder="What needs to be done?"
              disabled={taskModalSubmitting}
              required
            />
          </label>
          <label className="task-form__field">
            <span>Description</span>
            <textarea
              value={taskDescription}
              onChange={(event) => setTaskDescription(event.target.value)}
              placeholder="Add context or acceptance criteria"
              disabled={taskModalSubmitting}
            />
          </label>
          <label className="task-form__field" htmlFor={`${selectIdPrefix}-task-column`}>
            <span>Column</span>
            <Select
              id={`${selectIdPrefix}-task-column`}
              value={taskColumn}
              onChange={(next) => setTaskColumn(next as TaskStatus)}
              options={taskStatusSelectOptions}
              disabled={taskModalSubmitting}
              fullWidth
            />
          </label>
        </form>
      </Modal>
    </div>
  );
};

export default BoardLayout;
