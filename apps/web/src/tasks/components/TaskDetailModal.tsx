import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX, FormEvent } from 'react';
import type {
  TaskSummary,
  TaskStatus,
  TaskPriority,
  CommentSummary,
  AttachmentSummary,
  TaskChecklistItem
} from '@taskflow/types';
import { tasksApi } from '../taskApi.js';
import { commentsApi } from '../../comments/commentsApi.js';
import { attachmentsApi } from '../../attachments/attachmentsApi.js';
import { checklistApi } from '../checklistApi.js';
import Modal from '../../components/Modal.js';
import { ApiError } from '../../api/httpClient.js';
import type { UpdateTaskInput } from '../taskApi.js';

const priorityLabels: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical'
};

const priorityOptions: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const toDateTimeLocal = (value: string | null): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
};

const fromDateTimeLocal = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

interface StatusOption {
  status: TaskStatus;
  title: string;
}

/* eslint-disable no-unused-vars */
interface TaskDetailModalProps {
  open: boolean;
  task: TaskSummary | null;
  accessToken: string | null;
  canEdit: boolean;
  statusOptions: StatusOption[];
  onClose(): void;
  onTaskUpdated(task: TaskSummary): void;
  onTaskDeleted(task: TaskSummary): Promise<void>;
}
/* eslint-enable no-unused-vars */

const metadataRow = (label: string, value: string | null): JSX.Element | null => {
  if (!value) {
    return null;
  }
  return (
    <li>
      <span className="task-detail__meta-label">{label}</span>
      <span className="task-detail__meta-value">{value}</span>
    </li>
  );
};

const TaskDetailModal = ({
  open,
  task,
  accessToken,
  canEdit,
  statusOptions,
  onClose,
  onTaskUpdated,
  onTaskDeleted
}: TaskDetailModalProps): JSX.Element | null => {
  const [initialTask, setInitialTask] = useState<TaskSummary | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('TODO');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [comments, setComments] = useState<CommentSummary[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [newComment, setNewComment] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentSummary[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState('');
  const [checklistItems, setChecklistItems] = useState<TaskChecklistItem[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistError, setChecklistError] = useState('');
  const [newChecklistLabel, setNewChecklistLabel] = useState('');
  const [checklistSubmitting, setChecklistSubmitting] = useState(false);

  const applyChecklistState = useCallback(
    (items: TaskChecklistItem[], notify: boolean) => {
      const ordered = [...items].sort((a, b) => a.position - b.position);
      setChecklistItems(ordered);
      const completed = ordered.filter((item) => item.completedAt).length;
      const total = ordered.length;
      setInitialTask((current) => {
        const base = current ?? task ?? null;
        if (!base) {
          return current;
        }
        const updatedSummary: TaskSummary = {
          ...base,
          checklistCompletedCount: completed,
          checklistTotalCount: total
        };
        if (notify) {
          onTaskUpdated(updatedSummary);
        }
        return updatedSummary;
      });
    },
    [onTaskUpdated, task]
  );

  useEffect(() => {
    if (!open || !task) {
      setInitialTask(null);
      setTitle('');
      setDescription('');
      setStatus('TODO');
      setPriority('MEDIUM');
      setDueDate('');
      setSaveError('');
      setSaveStatus('');
      setComments([]);
      setCommentsError('');
      setAttachments([]);
      setAttachmentsError('');
      setNewComment('');
      setChecklistItems([]);
      setChecklistError('');
      setChecklistLoading(false);
      setNewChecklistLabel('');
      setChecklistSubmitting(false);
      return;
    }

    setInitialTask(task);
    setTitle(task.title);
    setDescription(task.description ?? '');
    setStatus(task.status);
    setPriority(task.priority);
    setDueDate(toDateTimeLocal(task.dueDate));
    setSaveError('');
    setSaveStatus('');

    if (!accessToken) {
      setComments([]);
      setAttachments([]);
      setCommentsError('Sign in to view comments');
      setAttachmentsError('Sign in to view attachments');
      setChecklistItems([]);
      setChecklistError('Sign in to view checklist');
      return;
    }

    let cancelled = false;

    const loadComments = async (): Promise<void> => {
      try {
        setCommentsLoading(true);
        setCommentsError('');
        const data = await commentsApi.list(accessToken, task.id);
        if (!cancelled) {
          setComments(data);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof ApiError ? error.message : 'Unable to load comments';
          setCommentsError(message);
        }
      } finally {
        if (!cancelled) {
          setCommentsLoading(false);
        }
      }
    };

    const loadAttachments = async (): Promise<void> => {
      try {
        setAttachmentsLoading(true);
        setAttachmentsError('');
        const data = await attachmentsApi.list(accessToken, task.id);
        if (!cancelled) {
          setAttachments(data);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof ApiError ? error.message : 'Unable to load attachments';
          setAttachmentsError(message);
        }
      } finally {
        if (!cancelled) {
          setAttachmentsLoading(false);
        }
      }
    };

    void loadComments();
    void loadAttachments();
    const loadChecklist = async (): Promise<void> => {
      try {
        setChecklistLoading(true);
        setChecklistError('');
        const data = await checklistApi.list(accessToken, task.id);
        if (!cancelled) {
          applyChecklistState(data, false);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof ApiError ? error.message : 'Unable to load checklist';
          setChecklistError(message);
          setChecklistItems([]);
        }
      } finally {
        if (!cancelled) {
          setChecklistLoading(false);
        }
      }
    };

    void loadChecklist();

    return () => {
      cancelled = true;
    };
  }, [accessToken, applyChecklistState, open, task]);

  const handleSave = async (): Promise<void> => {
    if (!task || !initialTask || !accessToken) {
      return;
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setSaveError('Title is required');
      setSaveStatus('');
      return;
    }

    const updates: UpdateTaskInput = {};
    if (trimmedTitle !== initialTask.title) {
      updates.title = trimmedTitle;
    }
    const normalizedDescription = description.trim();
    const initialDescription = initialTask.description ?? '';
    if (normalizedDescription !== initialDescription) {
      updates.description = normalizedDescription.length === 0 ? null : normalizedDescription;
    }
    if (status !== initialTask.status) {
      updates.status = status;
    }
    if (priority !== initialTask.priority) {
      updates.priority = priority;
    }
    const initialDueDateValue = toDateTimeLocal(initialTask.dueDate);
    if (dueDate !== initialDueDateValue) {
      updates.dueDate = dueDate ? fromDateTimeLocal(dueDate) : null;
    }

    if (Object.keys(updates).length === 0) {
      setSaveStatus('No changes to save');
      setSaveError('');
      return;
    }

    setSaving(true);
    setSaveError('');
    setSaveStatus('');
    try {
      const updated = await tasksApi.update(accessToken, task.id, updates);
      setInitialTask(updated);
      setTitle(updated.title);
      setDescription(updated.description ?? '');
      setStatus(updated.status);
      setPriority(updated.priority);
      setDueDate(toDateTimeLocal(updated.dueDate));
      onTaskUpdated(updated);
      setSaveStatus('Task updated successfully');
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Unable to update task');
    } finally {
      setSaving(false);
    }
  };

  const handleChecklistCreate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!task || !accessToken) {
      return;
    }
    const trimmed = newChecklistLabel.trim();
    if (trimmed.length === 0) {
      setChecklistError('Checklist item description is required');
      return;
    }
    setChecklistSubmitting(true);
    setChecklistError('');
    try {
      const created = await checklistApi.create(accessToken, task.id, trimmed);
      const nextItems = [...checklistItems, created].sort((a, b) => a.position - b.position);
      applyChecklistState(nextItems, true);
      setNewChecklistLabel('');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to add checklist item';
      setChecklistError(message);
    } finally {
      setChecklistSubmitting(false);
    }
  };

  const handleChecklistToggle = async (item: TaskChecklistItem): Promise<void> => {
    if (!task || !accessToken) {
      return;
    }
    setChecklistError('');
    try {
      const updated = await checklistApi.update(accessToken, task.id, item.id, {
        completed: !item.completedAt
      });
      const nextItems = checklistItems.map((entry) => (entry.id === item.id ? updated : entry)).sort((a, b) => a.position - b.position);
      applyChecklistState(nextItems, true);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to update checklist item';
      setChecklistError(message);
    }
  };

  const handleChecklistDelete = async (itemId: string): Promise<void> => {
    if (!task || !accessToken) {
      return;
    }
    setChecklistError('');
    try {
      await checklistApi.remove(accessToken, task.id, itemId);
      const nextItems = checklistItems.filter((entry) => entry.id !== itemId);
      applyChecklistState(nextItems, true);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to delete checklist item';
      setChecklistError(message);
    }
  };

  const handleCommentSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!task || !accessToken || newComment.trim().length === 0) {
      return;
    }
    setCommentSubmitting(true);
    setCommentsError('');
    try {
      const created = await commentsApi.create(accessToken, task.id, newComment.trim());
      setComments((current) => [...current, created]);
      setNewComment('');
    } catch (error) {
      setCommentsError(error instanceof ApiError ? error.message : 'Unable to add comment');
    } finally {
      setCommentSubmitting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!task || deleting) {
      return;
    }
    // eslint-disable-next-line no-alert
    const confirmed = window.confirm(`Delete "${task.title}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }
    setDeleting(true);
    setSaveError('');
    setSaveStatus('');
    try {
      await onTaskDeleted(task);
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Unable to delete task');
    } finally {
      setDeleting(false);
    }
  };

  const modalTitle = useMemo(() => (task ? `Task · ${task.title}` : 'Task details'), [task]);
  const detailTask = initialTask ?? task;

  if (!open) {
    return null;
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        onClose();
      }}
      title={modalTitle}
      footer={
        <div className="task-detail__footer">
          <div className="task-detail__footer-left">
            <button type="button" className="workspace-button workspace-button--ghost" onClick={onClose}>
              Close
            </button>
            {canEdit && (
              <button type="button" className="workspace-button workspace-button--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete task'}
              </button>
            )}
          </div>
          <div className="modal__footer-actions">
            <button type="submit" form="task-detail-form" className="board-button" disabled={!canEdit || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      }
    >
      <div className="task-detail">
        <div className="task-detail__main">
          <form
            id="task-detail-form"
            className="task-detail__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!saving) {
                void handleSave();
              }
            }}
          >
            {saveError && <div className="task-detail__error">{saveError}</div>}
            {saveStatus && <div className="task-detail__status">{saveStatus}</div>}
            <label className="task-detail__field">
              <span>Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={!canEdit || saving}
                required
              />
            </label>
            <label className="task-detail__field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add context, acceptance criteria, or links"
                disabled={!canEdit || saving}
                rows={6}
              />
            </label>
            <div className="task-detail__field-grid">
              <label className="task-detail__field">
                <span>Status</span>
                <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} disabled={!canEdit || saving}>
                  {statusOptions.map((option) => (
                    <option key={option.status} value={option.status}>
                      {option.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-detail__field">
                <span>Priority</span>
                <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} disabled={!canEdit || saving}>
                  {priorityOptions.map((option) => (
                    <option key={option} value={option}>
                      {priorityLabels[option]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="task-detail__field">
                <span>Due date</span>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  disabled={!canEdit || saving}
                />
              </label>
            </div>
          </form>

          <section className="task-detail__section">
            <div className="task-detail__section-header">
              <h3>Checklist</h3>
              {checklistLoading ? (
                <span className="task-detail__meta-value">Loading…</span>
              ) : detailTask ? (
                <span className="task-detail__meta-value">
                  {detailTask.checklistCompletedCount}/{detailTask.checklistTotalCount} completed
                </span>
              ) : null}
            </div>
            {checklistError && <div className="task-detail__error">{checklistError}</div>}
            {checklistItems.length === 0 && !checklistLoading && !checklistError && (
              <p className="task-detail__empty">No checklist items yet.</p>
            )}
            {checklistItems.length > 0 && (
              <ul className="task-checklist">
                {checklistItems.map((item) => (
                  <li
                    key={item.id}
                    className={`task-checklist__item${item.completedAt ? ' task-checklist__item--completed' : ''}`}
                  >
                    <label className="task-checklist__toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(item.completedAt)}
                        onChange={() => {
                          if (canEdit) {
                            void handleChecklistToggle(item);
                          }
                        }}
                        disabled={!canEdit}
                      />
                      <span>{item.label}</span>
                    </label>
                    {canEdit && (
                      <button
                        type="button"
                        className="task-checklist__delete"
                        onClick={() => {
                          void handleChecklistDelete(item.id);
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <form className="task-checklist__form" onSubmit={handleChecklistCreate}>
                <input
                  type="text"
                  value={newChecklistLabel}
                  onChange={(event) => setNewChecklistLabel(event.target.value)}
                  placeholder="Add checklist item"
                  disabled={checklistSubmitting}
                />
                <button
                  type="submit"
                  className="workspace-button"
                  disabled={checklistSubmitting || newChecklistLabel.trim().length === 0}
                >
                  {checklistSubmitting ? 'Adding…' : 'Add'}
                </button>
              </form>
            )}
          </section>

          <section className="task-detail__section">
            <div className="task-detail__section-header">
              <h3>Comments</h3>
              {commentsLoading && <span className="task-detail__meta-value">Loading…</span>}
            </div>
            {commentsError && <div className="task-detail__error">{commentsError}</div>}
            {comments.length === 0 && !commentsError && !commentsLoading && <p className="task-detail__empty">No comments yet.</p>}
            {comments.length > 0 && (
              <ul className="task-detail__comments">
                {comments.map((comment) => (
                  <li key={comment.id} className="task-detail__comment">
                    <div className="task-detail__comment-header">
                      <span className="task-detail__comment-author">{comment.author.name ?? comment.author.email}</span>
                      <span className="task-detail__comment-date">{new Date(comment.createdAt).toLocaleString()}</span>
                    </div>
                    <p>{comment.body}</p>
                  </li>
                ))}
              </ul>
            )}
            <form className="task-detail__comment-form" onSubmit={handleCommentSubmit}>
              <textarea
                value={newComment}
                onChange={(event) => setNewComment(event.target.value)}
                placeholder="Leave a comment"
                disabled={!canEdit || commentSubmitting}
                rows={3}
              />
              <button type="submit" className="workspace-button" disabled={!canEdit || commentSubmitting || newComment.trim().length === 0}>
                {commentSubmitting ? 'Posting…' : 'Post comment'}
              </button>
            </form>
          </section>
        </div>
        <aside className="task-detail__sidebar">
          <section className="task-detail__section">
            <h3>Details</h3>
            <ul className="task-detail__meta">
              {metadataRow('Created', detailTask ? new Date(detailTask.createdAt).toLocaleString() : null)}
              {metadataRow('Last updated', detailTask ? new Date(detailTask.updatedAt).toLocaleString() : null)}
              {detailTask?.dueDate ? metadataRow('Due', new Date(detailTask.dueDate).toLocaleString()) : null}
            </ul>
          </section>
          <section className="task-detail__section">
            <div className="task-detail__section-header">
              <h3>Attachments</h3>
              {attachmentsLoading && <span className="task-detail__meta-value">Loading…</span>}
            </div>
            {attachmentsError && <div className="task-detail__error">{attachmentsError}</div>}
            {attachments.length === 0 && !attachmentsError && !attachmentsLoading && <p className="task-detail__empty">No attachments yet.</p>}
            {attachments.length > 0 && (
              <ul className="task-detail__attachments">
                {attachments.map((attachment) => (
                  <li key={attachment.id} className="task-detail__attachment">
                    <a href={attachment.downloadUrl} target="_blank" rel="noreferrer">
                      {attachment.fileName}
                    </a>
                    <span className="task-detail__meta-value">
                      Uploaded {new Date(attachment.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </Modal>
  );
};

export default TaskDetailModal;
