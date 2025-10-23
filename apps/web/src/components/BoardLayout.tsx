import { useMemo, useState } from 'react';
import type { FormEvent, JSX } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useAuth } from '../auth/useAuth.js';
import Modal from './Modal.js';
import AuthPanel from '../auth/components/AuthPanel.js';

type ColumnKey = 'backlog' | 'in-progress' | 'review' | 'blocked' | 'done';

type Task = {
  id: string;
  title: string;
  description?: string;
  status: ColumnKey;
  createdAt: string;
};

const boardColumns: Array<{ key: ColumnKey; title: string; description: string }> = [
  { key: 'backlog', title: 'Backlog', description: 'Ideas and new requests' },
  { key: 'in-progress', title: 'In Progress', description: 'Work underway' },
  { key: 'review', title: 'In Review', description: 'Ready for review' },
  { key: 'blocked', title: 'Blocked', description: 'Waiting for input' },
  { key: 'done', title: 'Done', description: 'Completed work' }
];

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

const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `task-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
};

const BoardLayout = (): JSX.Element => {
  const auth = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskColumn, setTaskColumn] = useState<ColumnKey>('backlog');
  const [tasks, setTasks] = useState<Record<ColumnKey, Task[]>>({
    backlog: [],
    'in-progress': [],
    review: [],
    blocked: [],
    done: []
  });

  const initials = useMemo(() => getInitials(auth.user?.name, auth.user?.email), [auth.user?.email, auth.user?.name]);
  const userName = auth.user?.name ?? auth.user?.email ?? 'Taskflow user';

  const resetTaskModal = (): void => {
    setTaskTitle('');
    setTaskDescription('');
    setTaskColumn('backlog');
  };

  const openTaskModal = (column: ColumnKey): void => {
    resetTaskModal();
    setTaskColumn(column);
    setTaskModalOpen(true);
  };

  const handleTaskSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) {
      return;
    }

    const newTask: Task = {
      id: generateId(),
      title: trimmedTitle,
      description: taskDescription.trim() ? taskDescription.trim() : undefined,
      status: taskColumn,
      createdAt: new Date().toISOString()
    };

    setTasks((current) => ({
      ...current,
      [taskColumn]: [...current[taskColumn], newTask]
    }));

    setTaskModalOpen(false);
    resetTaskModal();
  };

  const handleTaskStatusChange = (taskId: string, currentColumn: ColumnKey, nextColumn: ColumnKey): void => {
    if (currentColumn === nextColumn) {
      return;
    }

    setTasks((current) => {
      const task = current[currentColumn].find((item) => item.id === taskId);
      if (!task) {
        return current;
      }

      return {
        ...current,
        [currentColumn]: current[currentColumn].filter((item) => item.id !== taskId),
        [nextColumn]: [...current[nextColumn], { ...task, status: nextColumn }]
      };
    });
  };

  const handleTaskRemove = (taskId: string, column: ColumnKey): void => {
    setTasks((current) => ({
      ...current,
      [column]: current[column].filter((task) => task.id !== taskId)
    }));
  };

  const handleDragEnd = ({ source, destination }: DropResult): void => {
    if (!destination) {
      return;
    }

    const startColumn = source.droppableId as ColumnKey;
    const finishColumn = destination.droppableId as ColumnKey;

    if (startColumn === finishColumn && source.index === destination.index) {
      return;
    }

    setTasks((current) => {
      const startTasks = Array.from(current[startColumn]);
      const [movedTask] = startTasks.splice(source.index, 1);
      if (!movedTask) {
        return current;
      }

      if (startColumn === finishColumn) {
        startTasks.splice(destination.index, 0, movedTask);
        return {
          ...current,
          [startColumn]: startTasks
        };
      }

      const finishTasks = Array.from(current[finishColumn]);
      const updatedTask: Task = { ...movedTask, status: finishColumn };
      finishTasks.splice(destination.index, 0, updatedTask);

      return {
        ...current,
        [startColumn]: startTasks,
        [finishColumn]: finishTasks
      };
    });
  };

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
            <button type="button" className="sidebar__link" onClick={() => openTaskModal('backlog')}>
              Invite via link
            </button>
          </div>

          <div className="sidebar__section">
            <p className="sidebar__section-title">Projects</p>
            <button type="button" className="sidebar__link" onClick={() => setSettingsOpen(true)}>
              Project overview
            </button>
            <button type="button" className="sidebar__link" onClick={() => openTaskModal('backlog')}>
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
            <h1>Workspace board</h1>
            <p>Track projects and tasks across your team. Columns and drag &amp; drop arrive in the next milestone.</p>
          </div>
          <div className="board-header__actions">
            <button type="button" className="board-button board-button--ghost" onClick={() => openTaskModal('backlog')}>
              New task
            </button>
            <button type="button" className="board-avatar" onClick={() => setSettingsOpen(true)}>
              <span>{initials}</span>
            </button>
          </div>
        </header>

        <DragDropContext onDragEnd={handleDragEnd}>
          <section className="board-columns" aria-label="Workspace board">
            {boardColumns.map((column) => (
              <Droppable droppableId={column.key} key={column.key}>
                {(provided, snapshot) => (
                  <article
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`board-column board-column--${column.key} ${snapshot.isDraggingOver ? 'board-column--dragging-over' : ''}`}
                  >
                    <header className="board-column__header">
                      <h2>{column.title}</h2>
                      <span className="board-column__count">{tasks[column.key].length}</span>
                    </header>
                    <p className="board-column__description">{column.description}</p>
                    {tasks[column.key].length === 0 ? (
                      <div className="board-column__empty">No tasks yet. Add one to get started.</div>
                    ) : (
                      <div className="board-column__tasks">
                        {tasks[column.key].map((task, index) => (
                          <Draggable draggableId={task.id} index={index} key={task.id}>
                            {(dragProvided, dragSnapshot) => (
                              <article
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={`board-task board-task--${column.key} ${
                                  dragSnapshot.isDragging ? 'board-task--dragging' : ''
                                }`}
                              >
                                <div className="board-task__content">
                                  <h3>{task.title}</h3>
                                  {task.description && <p>{task.description}</p>}
                                  <span className="board-task__meta">Added {new Date(task.createdAt).toLocaleString()}</span>
                                </div>
                                <div className="board-task__actions">
                                  <label htmlFor={`status-${task.id}`}>Status</label>
                                  <select
                                    id={`status-${task.id}`}
                                    value={task.status}
                                    onChange={(event) =>
                                      handleTaskStatusChange(task.id, column.key, event.target.value as ColumnKey)
                                    }
                                  >
                                    {boardColumns.map((option) => (
                                      <option key={option.key} value={option.key}>
                                        {option.title}
                                      </option>
                                    ))}
                                  </select>
                                  <button type="button" onClick={() => handleTaskRemove(task.id, column.key)}>
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
                    <button type="button" className="board-column__add" onClick={() => openTaskModal(column.key)}>
                      Add task
                    </button>
                  </article>
                )}
              </Droppable>
            ))}
          </section>
        </DragDropContext>
      </main>

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
            <button type="button" className="board-button board-button--ghost" onClick={() => setTaskModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" form="task-form" className="board-button">
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
              required
            />
          </label>
          <label className="task-form__field">
            <span>Description</span>
            <textarea
              value={taskDescription}
              onChange={(event) => setTaskDescription(event.target.value)}
              placeholder="Add context or acceptance criteria"
            />
          </label>
          <label className="task-form__field">
            <span>Column</span>
            <select value={taskColumn} onChange={(event) => setTaskColumn(event.target.value as ColumnKey)}>
              {boardColumns.map((column) => (
                <option key={column.key} value={column.key}>
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
