import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useAuth } from '../auth/useAuth.js';
import SettingsModal from './SettingsModal.js';
import AuthPanel from '../auth/components/AuthPanel.js';

const boardColumns = [
  { key: 'backlog', title: 'Backlog', description: 'Ideas and new requests' },
  { key: 'in-progress', title: 'In Progress', description: 'Work underway' },
  { key: 'review', title: 'In Review', description: 'Ready for review' },
  { key: 'blocked', title: 'Blocked', description: 'Waiting for input' },
  { key: 'done', title: 'Done', description: 'Completed work' }
] as const;

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
  const [settingsOpen, setSettingsOpen] = useState(false);

  const initials = useMemo(() => getInitials(auth.user?.name, auth.user?.email), [auth.user?.email, auth.user?.name]);
  const userName = auth.user?.name ?? auth.user?.email ?? 'Taskflow user';

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
            <button type="button" className="sidebar__link sidebar__link--muted" disabled>
              Invite via link
            </button>
          </div>

          <div className="sidebar__section">
            <p className="sidebar__section-title">Projects</p>
            <button type="button" className="sidebar__link sidebar__link--muted" disabled>
              Project overview
            </button>
            <button type="button" className="sidebar__link sidebar__link--muted" disabled>
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
            <button type="button" className="board-button board-button--ghost" disabled>
              New task
            </button>
            <button type="button" className="board-avatar" onClick={() => setSettingsOpen(true)}>
              <span>{initials}</span>
            </button>
          </div>
        </header>

        <section className="board-columns" aria-label="Workspace board">
          {boardColumns.map((column) => (
            <article key={column.key} className="board-column">
              <header className="board-column__header">
                <h2>{column.title}</h2>
                <span className="board-column__count">0</span>
              </header>
              <p className="board-column__description">{column.description}</p>
              <div className="board-column__empty">Tasks will appear here soon.</div>
              <button type="button" className="board-column__add" disabled>
                Add task
              </button>
            </article>
          ))}
        </section>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <AuthPanel />
      </SettingsModal>
    </div>
  );
};

export default BoardLayout;
