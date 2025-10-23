import type { JSX } from 'react';
import type { ProjectSummary, TaskSummary } from '@taskflow/types';

type TaskStatus = TaskSummary['status'];

interface StatusCount {
  status: TaskStatus;
  title: string;
  count: number;
}

interface ProjectOverviewProps {
  project: ProjectSummary | null;
  statusCounts: StatusCount[];
  totalCount: number;
  activeFilters: TaskStatus[];
  loading: boolean;
  onToggle(payload: { status: TaskStatus }): typeof payload | void;
  onReset: () => void;
}

const ProjectOverview = ({
  project,
  statusCounts,
  totalCount,
  activeFilters,
  loading,
  onToggle,
  onReset
}: ProjectOverviewProps): JSX.Element => {
  if (!project) {
    return (
      <section className="project-overview project-overview--empty" aria-live="polite">
        <p>Select a project to view its status breakdown.</p>
      </section>
    );
  }

  const filtered =
    activeFilters.length > 0 && activeFilters.length < statusCounts.length;
  const projectStatus =
    project.status === 'ARCHIVED' ? 'Archived' : 'Active';

  return (
    <section className="project-overview" aria-live="polite">
      <div className="project-overview__header">
        <div className="project-overview__title">
          <h2>{project.name}</h2>
          <div className="project-overview__meta">
            <span className="project-overview__key">{project.key}</span>
            <span className={`project-overview__state project-overview__state--${project.status.toLowerCase()}`}>
              {projectStatus}
            </span>
          </div>
        </div>
        <div className="project-overview__total">
          <span>Total tasks</span>
          <strong>{loading ? '…' : totalCount}</strong>
        </div>
      </div>
      {project.description && (
        <p className="project-overview__description">{project.description}</p>
      )}
      <div className="project-overview__filters">
        <div className="project-overview__chips">
          {statusCounts.map((entry) => {
            const selected = activeFilters.includes(entry.status);
            return (
              <button
                key={entry.status}
                type="button"
                className={`project-overview__chip${selected ? ' project-overview__chip--active' : ''}`}
                onClick={() => onToggle({ status: entry.status })}
                disabled={loading}
                aria-pressed={selected}
              >
                <span className="project-overview__chip-label">{entry.title}</span>
                <span className="project-overview__chip-count">{loading ? '…' : entry.count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="project-overview__reset"
          onClick={onReset}
          disabled={loading || !filtered}
        >
          Show all
        </button>
      </div>
    </section>
  );
};

export default ProjectOverview;
