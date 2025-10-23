import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, JSX } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useAuth } from '../auth/useAuth.js';
import Modal from './Modal.js';
import AuthPanel from '../auth/components/AuthPanel.js';
import type { TaskSummary, WorkspaceSummary, ProjectSummary } from '@taskflow/types';
import { workspaceApi } from '../workspaces/workspaceApi.js';
import { projectApi } from '../projects/projectApi.js';
import { tasksApi } from '../tasks/taskApi.js';
import { ApiError } from '../api/httpClient.js';
import TaskDetailModal from '../tasks/components/TaskDetailModal.js';

type TaskStatus = TaskSummary['status'];

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
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [boardTasks, setBoardTasks] = useState<Record<TaskStatus, TaskSummary[]>>(createEmptyBoard);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskModalSubmitting, setTaskModalSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState<TaskSummary | null>(null);
  const workspaceEnsuredRef = useRef(false);
  const projectEnsuredRef = useRef<Record<string, boolean>>({});

  const initials = useMemo(() => getInitials(auth.user?.name, auth.user?.email), [auth.user?.email, auth.user?.name]);
  const userName = auth.user?.name ?? auth.user?.email ?? 'Taskflow user';
  const activeWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null,
    [selectedWorkspaceId, workspaces]
  );
  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
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
    return 'Drag and drop tasks to update status. Changes sync automatically.';
  }, [activeWorkspace, activeProject, loadingWorkspaces, loadingProjects, loadingTasks, projects.length]);

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

  const handleTaskStatusChange = (taskId: string, currentStatus: TaskStatus, nextStatus: TaskStatus): void => {
    if (
      currentStatus === nextStatus ||
      !selectedProjectId ||
      !accessToken ||
      syncing ||
      loadingTasks
    ) {
      return;
    }

    const previous = cloneBoard(boardTasks);
    const next = cloneBoard(boardTasks);
    const sourceTasks = next[currentStatus];
    const index = sourceTasks.findIndex((task) => task.id === taskId);
    if (index === -1) {
      return;
    }
    const [task] = sourceTasks.splice(index, 1);
    const updatedTask = { ...task, status: nextStatus };
    next[nextStatus].push(updatedTask);
    if (taskDetail?.id === taskId) {
      setTaskDetail({ ...taskDetail, status: nextStatus });
    }
    void runBoardMutation(next, previous);
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
      loadingTasks
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
  const canMutateBoard =
    Boolean(selectedProjectId && accessToken) && !syncing && !loadingTasks && !loadingProjects && !loadingWorkspaces;

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="sidebar__brand">
          <span className="sidebar__logo">TF</span>
          <span className="sidebar__title">Taskflow</span>
        </div>

        <nav className="sidebar__nav">
          <div className="sidebar__section">
            <p className="sidebar__section-title">Workspace</p>
            <button type="button" className="sidebar__link" onClick={() => setSettingsOpen(true)}>
              Manage members
            </button>
            <button type="button" className="sidebar__link" onClick={() => openTaskModal('TODO')}>
              Invite via link
            </button>
          </div>

          <div className="sidebar__section">
            <p className="sidebar__section-title">Projects</p>
            <button type="button" className="sidebar__link" onClick={() => setSettingsOpen(true)}>
              Project overview
            </button>
            <button type="button" className="sidebar__link" onClick={() => openTaskModal('TODO')}>
              Create project
            </button>
          </div>
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__footer-label">Signed in as</span>
          <strong className="sidebar__footer-value">{userName}</strong>
          <button type="button" className="sidebar__logout" onClick={() => auth.logout()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="app-shell__main">
        <header className="board-header">
          <div>
            <h1>{activeWorkspace ? activeWorkspace.name : 'Workspace board'}</h1>
            <p>{boardSubtitle}</p>
          </div>
          <div className="board-header__actions">
            <div className="board-header__selectors">
              <label>
                <span>Workspace</span>
                <select
                  value={workspaceValue}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedWorkspaceId(event.target.value || null)}
                  disabled={loadingWorkspaces || syncing || workspaces.length === 0}
                >
                  {workspaces.length === 0 ? (
                    <option value="">No workspaces</option>
                  ) : (
                    workspaces.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <label>
                <span>Project</span>
                <select
                  value={projectValue}
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => setSelectedProjectId(event.target.value || null)}
                  disabled={loadingProjects || syncing || projects.length === 0}
                >
                  {projects.length === 0 ? (
                    <option value="">No projects</option>
                  ) : (
                    projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
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

        {errorMessage && <div className="board-feedback board-feedback--error">{errorMessage}</div>}
        {infoMessage && <div className="board-feedback board-feedback--info">{infoMessage}</div>}
        {syncing && !loadingTasks && <div className="board-feedback board-feedback--info">Saving changes…</div>}

        <DragDropContext onDragEnd={handleDragEnd}>
          <section className="board-columns" aria-label="Workspace board">
            {columnDefinitions.map((column) => (
              <Droppable droppableId={column.status} key={column.status}>
                {(provided, snapshot) => (
                  <article
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`board-column board-column--${column.className} ${
                      snapshot.isDraggingOver ? 'board-column--dragging-over' : ''
                    }`}
                  >
                    <header className="board-column__header">
                      <h2>{column.title}</h2>
                      <div className="board-column__header-actions">
                        <span className="board-column__count">{boardTasks[column.status].length}</span>
                        <button
                          type="button"
                          className="board-column__add-icon"
                          onClick={() => openTaskModal(column.status)}
                          disabled={!canMutateBoard}
                          aria-label={`Add task to ${column.title}`}
                        >
                          +
                        </button>
                      </div>
                    </header>
                    <p className="board-column__description">{column.description}</p>
                    {boardTasks[column.status].length === 0 ? (
                      <div className="board-column__empty">No tasks yet. Add one to get started.</div>
                    ) : (
                      <div className="board-column__tasks">
                        {boardTasks[column.status].map((task, index) => (
                          <Draggable draggableId={task.id} index={index} key={task.id}>
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
                                  <label htmlFor={`status-${task.id}`}>Status</label>
                                  <select
                                    id={`status-${task.id}`}
                                    value={task.status}
                                    onChange={(event) =>
                                      handleTaskStatusChange(task.id, column.status, event.target.value as TaskStatus)
                                    }
                                    disabled={!canMutateBoard}
                                  >
                                    {columnDefinitions.map((option) => (
                                      <option key={option.status} value={option.status}>
                                        {option.title}
                                      </option>
                                    ))}
                                  </select>
                                  <button type="button" onClick={() => handleTaskRemove(task.id, column.status)} disabled={!canMutateBoard}>
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
            ))}
          </section>
        </DragDropContext>
      </main>

      <TaskDetailModal
        open={taskDetailOpen}
        task={taskDetail}
        accessToken={accessToken}
        canEdit={canMutateBoard}
        statusOptions={columnDefinitions.map((column) => ({ status: column.status, title: column.title }))}
        onClose={closeTaskDetail}
        onTaskUpdated={handleTaskUpdatedFromModal}
        onTaskDeleted={handleTaskDeletedFromModal}
      />

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
          <label className="task-form__field">
            <span>Column</span>
            <select value={taskColumn} onChange={(event) => setTaskColumn(event.target.value as TaskStatus)} disabled={taskModalSubmitting}>
              {columnDefinitions.map((column) => (
                <option key={column.status} value={column.status}>
                  {column.title}
                </option>
              ))}
            </select>
          </label>
        </form>
      </Modal>
    </div>
  );
};

export default BoardLayout;
