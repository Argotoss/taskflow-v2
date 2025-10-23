import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { ProjectSummary, TaskSummary } from '@taskflow/types';
import ProjectOverview from './ProjectOverview.js';

type TaskStatus = TaskSummary['status'];
type StatusCount = { status: TaskStatus; title: string; count: number };

const buildProject = (overrides: Partial<ProjectSummary> = {}): ProjectSummary => ({
  id: '11111111-1111-1111-1111-111111111111',
  workspaceId: '22222222-2222-2222-2222-222222222222',
  ownerId: '33333333-3333-3333-3333-333333333333',
  name: 'Delivery Board',
  key: 'DEL',
  description: 'Plan feature delivery across the team.',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

const buildCounts = (entries: StatusCount[]): StatusCount[] => entries;

describe('ProjectOverview', () => {
  it('asks user to pick a project when none is selected', () => {
    render(
      <ProjectOverview
        project={null}
        statusCounts={buildCounts([])}
        totalCount={0}
        activeFilters={[]}
        loading={false}
        onToggle={() => {}}
        onReset={() => {}}
      />
    );
    expect(screen.getByText('Select a project to view its status breakdown.')).toBeInTheDocument();
  });

  it('renders task counts and triggers filter toggles', () => {
    const toggle = vi.fn();
    render(
      <ProjectOverview
        project={buildProject()}
        statusCounts={buildCounts([
          { status: 'TODO', title: 'Backlog', count: 4 },
          { status: 'IN_PROGRESS', title: 'In Progress', count: 2 }
        ])}
        totalCount={6}
        activeFilters={['TODO', 'IN_PROGRESS']}
        loading={false}
        onToggle={toggle}
        onReset={() => {}}
      />
    );
    expect(screen.getByText('Delivery Board')).toBeInTheDocument();
    expect(screen.getByText('Total tasks').nextSibling?.textContent).toBe('6');
    const chip = screen.getByRole('button', { name: /Backlog/i });
    fireEvent.click(chip);
    expect(toggle).toHaveBeenCalledWith({ status: 'TODO' });
  });

  it('disables reset button while loading', () => {
    const reset = vi.fn();
    const { container } = render(
      <ProjectOverview
        project={buildProject()}
        statusCounts={buildCounts([
          { status: 'TODO', title: 'Backlog', count: 0 }
        ])}
        totalCount={0}
        activeFilters={['TODO']}
        loading
        onToggle={() => {}}
        onReset={reset}
      />
    );
    const resetButton = within(container).getByRole('button', { name: /Show all/i });
    expect(resetButton).toBeDisabled();
    fireEvent.click(resetButton);
    expect(reset).not.toHaveBeenCalled();
  });
});
