import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX, FormEvent } from 'react';
import type { MembershipSummary, WorkspaceSummary, WorkspaceInviteSummary, ProjectSummary } from '@taskflow/types';
import { membershipRoleSchema } from '@taskflow/types';
import { workspaceApi } from '../workspaceApi.js';
import { projectApi } from '../../projects/projectApi.js';
import { ApiError } from '../../api/httpClient.js';

type MembershipRole = (typeof membershipRoleSchema)['options'][number];

interface WorkspaceAdminPanelProps {
  accessToken: string | null;
  currentUserId: string;
}

const roleLabels: Record<MembershipRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  CONTRIBUTOR: 'Contributor',
  VIEWER: 'Viewer'
};

const buildInviteLink = (token: string): string => {
  if (typeof window === 'undefined') {
    return token;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('invite', token);
  url.searchParams.delete('token');
  return url.toString();
};

const WorkspaceAdminPanel = ({ accessToken, currentUserId }: WorkspaceAdminPanelProps): JSX.Element => {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState('');
  const [members, setMembers] = useState<MembershipSummary[]>([]);
  const [invites, setInvites] = useState<WorkspaceInviteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState('');
  const [memberError, setMemberError] = useState('');
  const [memberNotice, setMemberNotice] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipRole>('CONTRIBUTOR');
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [workspaceSubmitting, setWorkspaceSubmitting] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [editWorkspaceName, setEditWorkspaceName] = useState('');
  const [editWorkspaceDescription, setEditWorkspaceDescription] = useState('');
  const [workspaceUpdating, setWorkspaceUpdating] = useState(false);
  const [workspaceUpdateError, setWorkspaceUpdateError] = useState('');
  const [workspaceUpdateStatus, setWorkspaceUpdateStatus] = useState('');
  const [transferMembershipId, setTransferMembershipId] = useState('');
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferStatus, setTransferStatus] = useState('');
  const [projectNameEdits, setProjectNameEdits] = useState<Record<string, string>>({});
  const [projectSaving, setProjectSaving] = useState<Record<string, boolean>>({});
  const [projectStatusMessage, setProjectStatusMessage] = useState('');
  const [projectError, setProjectError] = useState('');

  const currentMembership = useMemo(() => members.find((member) => member.userId === currentUserId), [currentUserId, members]);
  const canManageWorkspaceSettings = currentMembership ? currentMembership.role === 'OWNER' || currentMembership.role === 'ADMIN' : false;
  const canManageProjects = currentMembership ? currentMembership.role === 'OWNER' || currentMembership.role === 'ADMIN' || currentMembership.role === 'CONTRIBUTOR' : false;
  const canInvite = canManageWorkspaceSettings;
  const isOwner = currentMembership?.role === 'OWNER';

  const slugify = useCallback((value: string) => {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'workspace';
  }, []);

  const clearWorkspaceState = (): void => {
    setMembers([]);
    setInvites([]);
    setProjects([]);
    setProjectNameEdits({});
    setProjectSaving({});
    setProjectStatusMessage('');
    setProjectError('');
  };

  const loadWorkspaceData = useCallback(
    async (workspaceId: string, token: string) => {
      setMembersLoading(true);
      setMemberError('');
      setMemberNotice('');
      setProjectError('');
      setProjectStatusMessage('');
      const [memberResult, inviteResult, projectResult] = await Promise.allSettled([
        workspaceApi.members(token, workspaceId),
        workspaceApi.invites(token, workspaceId),
        projectApi.list(token, workspaceId)
      ]);
      const membershipFailed = memberResult.status === 'rejected' || inviteResult.status === 'rejected';
      if (!membershipFailed) {
        setMembers(memberResult.value);
        setInvites(inviteResult.value);
      } else {
        const reason = memberResult.status === 'rejected' ? memberResult.reason : inviteResult.status === 'rejected' ? inviteResult.reason : null;
        const message =
          reason instanceof ApiError ? reason.message : 'Failed to load workspace access data';
        setMemberError(message);
        setMembers([]);
        setInvites([]);
      }
      if (projectResult.status === 'fulfilled') {
        setProjects(projectResult.value);
      } else {
        const message = projectResult.reason instanceof ApiError ? projectResult.reason.message : 'Failed to load projects';
        setProjectError(message);
        setProjects([]);
      }
      setMembersLoading(false);
    },
    []
  );

  useEffect(() => {
    if (!accessToken) {
      setWorkspaces([]);
      setSelectedWorkspaceId('');
      clearWorkspaceState();
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    workspaceApi
      .list(accessToken)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setWorkspaces(data);
        if (data.length === 0) {
          setSelectedWorkspaceId('');
          clearWorkspaceState();
          setShowCreate(true);
          return;
        }
        setSelectedWorkspaceId((current) => {
          if (current && data.some((workspace) => workspace.id === current)) {
            return current;
          }
          return data[0].id;
        });
        setShowCreate(false);
      })
      .catch((exception) => {
        if (cancelled) {
          return;
        }
        const message = exception instanceof ApiError ? exception.message : 'Failed to load workspaces';
        setError(message);
        setWorkspaces([]);
        setSelectedWorkspaceId('');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedWorkspaceId) {
      return;
    }
    void loadWorkspaceData(selectedWorkspaceId, accessToken);
  }, [accessToken, loadWorkspaceData, selectedWorkspaceId]);

  useEffect(() => {
    const selected = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;
    if (selected) {
      setEditWorkspaceName(selected.name);
      setEditWorkspaceDescription(selected.description ?? '');
    } else {
      setEditWorkspaceName('');
      setEditWorkspaceDescription('');
    }
    setWorkspaceUpdateError('');
    setWorkspaceUpdateStatus('');
    setTransferError('');
    setTransferStatus('');
    setTransferMembershipId('');
  }, [selectedWorkspaceId, workspaces]);

  useEffect(() => {
    const entries: Record<string, string> = {};
    projects.forEach((project) => {
      entries[project.id] = project.name;
    });
    setProjectNameEdits(entries);
    setProjectSaving({});
    setProjectError('');
    setProjectStatusMessage('');
  }, [projects]);

  useEffect(() => {
    if (!isOwner) {
      setTransferMembershipId('');
      return;
    }
    if (transferMembershipId && members.some((member) => member.id === transferMembershipId)) {
      return;
    }
    const candidate = members.find((member) => member.userId !== currentUserId && member.role !== 'OWNER');
    setTransferMembershipId(candidate ? candidate.id : '');
  }, [currentUserId, isOwner, members, transferMembershipId]);

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !selectedWorkspaceId) {
      return;
    }
    setInviteSubmitting(true);
    setInviteError('');
    setInviteLink('');
    try {
      const token = await workspaceApi.createInvite(accessToken, selectedWorkspaceId, inviteEmail, inviteRole);
      setInviteLink(buildInviteLink(token));
      setInviteEmail('');
      await loadWorkspaceData(selectedWorkspaceId, accessToken);
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to create invite';
      setInviteError(message);
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleRoleChange = async (membershipId: string, role: MembershipRole): Promise<void> => {
    if (!accessToken || !selectedWorkspaceId) {
      return;
    }
    setMemberError('');
    setMemberNotice('');
    try {
      const updated = await workspaceApi.updateMember(accessToken, selectedWorkspaceId, membershipId, role);
      setMembers((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setMemberNotice('Member role updated');
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to update member';
      setMemberError(message);
    }
  };

  const handleRemoveMember = async (membershipId: string): Promise<void> => {
    if (!accessToken || !selectedWorkspaceId) {
      return;
    }
    setMemberError('');
    setMemberNotice('');
    try {
      await workspaceApi.removeMember(accessToken, selectedWorkspaceId, membershipId);
      setMembers((current) => current.filter((entry) => entry.id !== membershipId));
      if (members.find((entry) => entry.id === membershipId)?.userId === currentUserId) {
        const updatedWorkspaces = await workspaceApi.list(accessToken);
        setWorkspaces(updatedWorkspaces);
        if (!updatedWorkspaces.find((workspace) => workspace.id === selectedWorkspaceId)) {
          const nextWorkspace = updatedWorkspaces[0]?.id ?? '';
          setSelectedWorkspaceId(nextWorkspace);
          if (!nextWorkspace) {
            clearWorkspaceState();
            setShowCreate(true);
          }
        }
      } else {
        setMemberNotice('Member removed');
      }
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to remove member';
      setMemberError(message);
    }
  };

  const handleRevokeInvite = async (inviteId: string): Promise<void> => {
    if (!accessToken || !selectedWorkspaceId) {
      return;
    }
    setInviteError('');
    try {
      await workspaceApi.deleteInvite(accessToken, selectedWorkspaceId, inviteId);
      setInvites((current) => current.filter((entry) => entry.id !== inviteId));
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to revoke invite';
      setInviteError(message);
    }
  };

  const handleWorkspaceUpdate = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !selectedWorkspaceId) {
      return;
    }
    if (!canManageWorkspaceSettings) {
      return;
    }
    const selected = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
    if (!selected) {
      return;
    }
    const trimmedName = editWorkspaceName.trim();
    const trimmedDescription = editWorkspaceDescription.trim();
    if (trimmedName.length === 0) {
      setWorkspaceUpdateError('Workspace name is required');
      setWorkspaceUpdateStatus('');
      return;
    }
    const payload: Record<string, unknown> = {};
    if (trimmedName !== selected.name) {
      payload.name = trimmedName;
    }
    const currentDescription = selected.description ?? '';
    if (trimmedDescription !== currentDescription) {
      payload.description = trimmedDescription.length === 0 ? null : trimmedDescription;
    }
    if (Object.keys(payload).length === 0) {
      setWorkspaceUpdateStatus('No changes to save');
      setWorkspaceUpdateError('');
      return;
    }
    setWorkspaceUpdating(true);
    setWorkspaceUpdateError('');
    setWorkspaceUpdateStatus('');
    try {
      const updated = await workspaceApi.update(accessToken, selectedWorkspaceId, payload);
      setWorkspaces((current) => current.map((workspace) => (workspace.id === updated.id ? updated : workspace)));
      setEditWorkspaceName(updated.name);
      setEditWorkspaceDescription(updated.description ?? '');
      setWorkspaceUpdateStatus('Workspace updated');
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to update workspace';
      setWorkspaceUpdateError(message);
    } finally {
      setWorkspaceUpdating(false);
    }
  };

  const handleTransferOwnership = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken || !selectedWorkspaceId) {
      return;
    }
    if (!transferMembershipId) {
      setTransferError('Select a member to transfer ownership to');
      setTransferStatus('');
      return;
    }
    setTransferSubmitting(true);
    setTransferError('');
    setTransferStatus('');
    try {
      const updated = await workspaceApi.transfer(accessToken, selectedWorkspaceId, transferMembershipId);
      setWorkspaces((current) => current.map((workspace) => (workspace.id === updated.id ? updated : workspace)));
      await loadWorkspaceData(selectedWorkspaceId, accessToken);
      setTransferStatus('Ownership transferred');
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to transfer ownership';
      setTransferError(message);
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleProjectRename = async (projectId: string): Promise<void> => {
    if (!accessToken) {
      return;
    }
    if (!canManageProjects) {
      return;
    }
    const project = projects.find((entry) => entry.id === projectId);
    if (!project) {
      return;
    }
    const proposedName = (projectNameEdits[projectId] ?? '').trim();
    if (proposedName.length === 0) {
      setProjectError('Project name is required');
      setProjectStatusMessage('');
      return;
    }
    if (proposedName === project.name) {
      setProjectStatusMessage('No changes to save');
      setProjectError('');
      return;
    }
    setProjectSaving((current) => ({ ...current, [projectId]: true }));
    setProjectError('');
    setProjectStatusMessage('');
    try {
      const updated = await projectApi.update(accessToken, projectId, { name: proposedName });
      setProjects((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setProjectNameEdits((current) => ({ ...current, [projectId]: updated.name }));
      setProjectStatusMessage('Project updated');
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to update project';
      setProjectError(message);
    } finally {
      setProjectSaving((current) => ({ ...current, [projectId]: false }));
    }
  };

  const handleProjectStatusChange = async (projectId: string, nextStatus: ProjectSummary['status']): Promise<void> => {
    if (!accessToken) {
      return;
    }
    if (!canManageProjects) {
      return;
    }
    const project = projects.find((entry) => entry.id === projectId);
    if (!project || project.status === nextStatus) {
      return;
    }
    setProjectSaving((current) => ({ ...current, [projectId]: true }));
    setProjectError('');
    setProjectStatusMessage('');
    try {
      const updated = await projectApi.update(accessToken, projectId, { status: nextStatus });
      setProjects((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setProjectNameEdits((current) => ({ ...current, [projectId]: updated.name }));
      setProjectStatusMessage(nextStatus === 'ARCHIVED' ? 'Project archived' : 'Project restored');
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to update project';
      setProjectError(message);
    } finally {
      setProjectSaving((current) => ({ ...current, [projectId]: false }));
    }
  };

  const handleWorkspaceNameChange = (value: string): void => {
    setWorkspaceName(value);
    if (!slugTouched) {
      setWorkspaceSlug(slugify(value));
    }
  };

  const handleCreateWorkspace = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!accessToken) {
      return;
    }
    setWorkspaceError('');
    setWorkspaceSubmitting(true);
    try {
      const created = await workspaceApi.create(accessToken, {
        name: workspaceName.trim(),
        slug: workspaceSlug.trim(),
        description: workspaceDescription.trim() ? workspaceDescription.trim() : null
      });
      setWorkspaces((current) => [...current, created]);
      setSelectedWorkspaceId(created.id);
      setWorkspaceName('');
      setWorkspaceSlug('');
      setWorkspaceDescription('');
      setSlugTouched(false);
      setShowCreate(false);
      await loadWorkspaceData(created.id, accessToken);
    } catch (exception) {
      const message = exception instanceof ApiError ? exception.message : 'Unable to create workspace';
      setWorkspaceError(message);
    } finally {
      setWorkspaceSubmitting(false);
    }
  };

  if (!accessToken) {
    return (
      <section className="workspace-card">
        <h3>Workspace access</h3>
        <p className="workspace-card__notice">Sign in to manage workspaces and invitations.</p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="workspace-card">
        <h3>Workspace access</h3>
        <p className="workspace-card__notice">Loading workspaces…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="workspace-card">
        <h3>Workspace access</h3>
        <div className="workspace-card__error">{error}</div>
      </section>
    );
  }

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ?? workspaces[0];
  const selectedWorkspaceName = selectedWorkspace?.name ?? '';

  const renderCreateForm = (): JSX.Element => (
    <div className="workspace-section">
      <h4>Create workspace</h4>
      {workspaceError && <div className="workspace-card__error">{workspaceError}</div>}
      <form className="workspace-create" onSubmit={handleCreateWorkspace}>
        <label className="workspace-create__field">
          <span>Name</span>
          <input
            value={workspaceName}
            onChange={(event) => handleWorkspaceNameChange(event.currentTarget.value)}
            placeholder="Product Delivery"
            required
          />
        </label>
        <label className="workspace-create__field">
          <span>Slug</span>
          <input
            value={workspaceSlug}
            onChange={(event) => {
              setWorkspaceSlug(event.currentTarget.value);
              setSlugTouched(true);
            }}
            placeholder="product-delivery"
            required
          />
        </label>
        <label className="workspace-create__field">
          <span>Description</span>
          <textarea
            value={workspaceDescription}
            onChange={(event) => setWorkspaceDescription(event.currentTarget.value)}
            placeholder="What is this workspace for?"
          />
        </label>
        <div className="workspace-create__actions">
          {workspaces.length > 0 && (
            <button
              type="button"
              className="workspace-button workspace-button--ghost"
              onClick={() => {
                setShowCreate(false);
                setWorkspaceError('');
              }}
            >
              Cancel
            </button>
          )}
          <button className="workspace-button" type="submit" disabled={workspaceSubmitting}>
            {workspaceSubmitting ? 'Creating…' : 'Create workspace'}
          </button>
        </div>
      </form>
    </div>
  );

  return (
    <section className="workspace-card">
      <div className="workspace-card__header">
        <h3>Workspace access</h3>
        {workspaces.length > 0 && (
          <div className="workspace-card__actions">
            <select
              className="workspace-card__selector"
              value={selectedWorkspaceId}
              onChange={(event) => setSelectedWorkspaceId(event.target.value)}
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="workspace-button"
              onClick={() => {
                setShowCreate(true);
                setWorkspaceError('');
              }}
            >
              New workspace
            </button>
          </div>
        )}
      </div>

      {showCreate || workspaces.length === 0 ? renderCreateForm() : null}

      {workspaces.length > 0 && !showCreate && (
        <>
          <div className="workspace-section">
            <h4>Workspace settings</h4>
            {workspaceUpdateError && <div className="workspace-card__error">{workspaceUpdateError}</div>}
            {workspaceUpdateStatus && <div className="workspace-card__status">{workspaceUpdateStatus}</div>}
            {!canManageWorkspaceSettings && <p className="workspace-card__notice">Only workspace owners or admins can update workspace details.</p>}
            <form className="workspace-create" onSubmit={handleWorkspaceUpdate}>
              <label className="workspace-create__field">
                <span>Name</span>
                <input
                  value={editWorkspaceName}
                  onChange={(event) => setEditWorkspaceName(event.target.value)}
                  disabled={!canManageWorkspaceSettings || workspaceUpdating}
                  required
                />
              </label>
              <label className="workspace-create__field">
                <span>Description</span>
                <textarea
                  value={editWorkspaceDescription}
                  onChange={(event) => setEditWorkspaceDescription(event.target.value)}
                  disabled={!canManageWorkspaceSettings || workspaceUpdating}
                />
              </label>
              <div className="workspace-create__actions">
                <button className="workspace-button" type="submit" disabled={!canManageWorkspaceSettings || workspaceUpdating}>
                  {workspaceUpdating ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>

          <div className="workspace-section">
            <h4>Ownership</h4>
            {!isOwner && <p className="workspace-card__notice">Only the current owner can transfer the workspace.</p>}
            {transferError && <div className="workspace-card__error">{transferError}</div>}
            {transferStatus && <div className="workspace-card__status">{transferStatus}</div>}
            {isOwner ? (
              members.length <= 1 ? (
                <p className="workspace-card__notice">Invite another member before transferring ownership.</p>
              ) : (
                <form className="workspace-invite" onSubmit={handleTransferOwnership}>
                  <select
                    value={transferMembershipId}
                    onChange={(event) => setTransferMembershipId(event.target.value)}
                    disabled={transferSubmitting}
                    required
                  >
                    <option value="" disabled>
                      Select new owner
                    </option>
                    {members
                      .filter((member) => member.userId !== currentUserId)
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.user.name ?? member.user.email} ({roleLabels[member.role]})
                        </option>
                      ))}
                  </select>
                  <button type="submit" className="workspace-button" disabled={transferSubmitting || !transferMembershipId}>
                    {transferSubmitting ? 'Transferring…' : 'Transfer ownership'}
                  </button>
                </form>
              )
            ) : null}
          </div>

          <div className="workspace-section">
            <h4>Projects</h4>
            {!canManageProjects && <p className="workspace-card__notice">Only owners, admins, or contributors can update projects.</p>}
            {projectError && <div className="workspace-card__error">{projectError}</div>}
            {projectStatusMessage && <div className="workspace-card__status">{projectStatusMessage}</div>}
            {projects.length === 0 ? (
              <p className="workspace-card__notice">No projects yet. Create one to organize tasks.</p>
            ) : (
              <ul className="workspace-projects">
                {projects.map((project) => {
                  const editName = projectNameEdits[project.id] ?? project.name;
                  const saving = projectSaving[project.id] ?? false;
                  const isArchived = project.status === 'ARCHIVED';
                  return (
                    <li key={project.id} className="workspace-projects__item">
                      <div className="workspace-projects__info">
                        <input
                          value={editName}
                          onChange={(event) =>
                            setProjectNameEdits((current) => ({ ...current, [project.id]: event.target.value }))
                          }
                          disabled={!canManageProjects || saving}
                        />
                        <span className={`workspace-projects__badge workspace-projects__badge--${project.status.toLowerCase()}`}>
                          {project.status.toLowerCase() === 'archived' ? 'Archived' : 'Active'}
                        </span>
                      </div>
                      <div className="workspace-projects__actions">
                        <button
                          type="button"
                          className="workspace-button workspace-button--ghost"
                          onClick={() => void handleProjectRename(project.id)}
                          disabled={!canManageProjects || saving}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="workspace-button workspace-button--ghost"
                          onClick={() => void handleProjectStatusChange(project.id, isArchived ? 'ACTIVE' : 'ARCHIVED')}
                          disabled={!canManageProjects || saving}
                        >
                          {isArchived ? 'Restore' : 'Archive'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {membersLoading ? (
            <p className="workspace-card__notice">Loading members…</p>
          ) : (
            <div className="workspace-section">
              <h4>Members</h4>
              {memberError && <div className="workspace-card__error">{memberError}</div>}
              {memberNotice && <div className="workspace-card__status">{memberNotice}</div>}
              <ul className="workspace-members">
                {members.map((member) => {
                  const isSelf = member.userId === currentUserId;
                  const disableRoleChange = !isOwner || isSelf;
                  const ownerCount = members.filter((entry) => entry.role === 'OWNER').length;
                  const disableRemove = (!isOwner && !isSelf) || (isSelf && member.role === 'OWNER' && ownerCount === 1);
                  return (
                    <li key={member.id} className="workspace-members__item">
                      <div className="workspace-members__info">
                        <span className="workspace-members__name">{member.user.name}</span>
                        <span className="workspace-members__email">{member.user.email}</span>
                      </div>
                      <div className="workspace-members__actions">
                        <select
                          value={member.role}
                          onChange={(event) => handleRoleChange(member.id, event.target.value as MembershipRole)}
                          disabled={disableRoleChange}
                        >
                          {membershipRoleSchema.options.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="workspace-button workspace-button--ghost"
                          onClick={() => handleRemoveMember(member.id)}
                          disabled={disableRemove}
                        >
                          {isSelf ? 'Leave' : 'Remove'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="workspace-section">
            <h4>Invite teammates</h4>
            {!canInvite && <p className="workspace-card__notice">Only workspace owners or admins can send invites.</p>}
            {inviteError && <div className="workspace-card__error">{inviteError}</div>}
            {inviteLink && (
              <div className="workspace-card__status">
                Invite ready: <a href={inviteLink}>{inviteLink}</a>
              </div>
            )}
            <form className="workspace-invite" onSubmit={handleInviteSubmit}>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="colleague@example.com"
                disabled={!canInvite || inviteSubmitting}
                required
              />
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as MembershipRole)} disabled={!canInvite || inviteSubmitting}>
                {membershipRoleSchema.options.map((role) => (
                  <option key={role} value={role}>
                    {roleLabels[role]}
                  </option>
                ))}
              </select>
              <button type="submit" className="workspace-button" disabled={!canInvite || inviteSubmitting}>
                {inviteSubmitting ? 'Sending…' : `Invite to ${selectedWorkspaceName}`}
              </button>
            </form>
          </div>

          {invites.length > 0 && (
            <div className="workspace-section">
              <h4>Pending invites</h4>
              <ul className="workspace-invites">
                {invites.map((invite) => (
                  <li key={invite.id} className="workspace-invites__item">
                    <div className="workspace-invites__info">
                      <span className="workspace-invites__email">{invite.email}</span>
                      <span className="workspace-invites__meta">Role: {roleLabels[invite.role]}</span>
                      <span className="workspace-invites__meta">Expires: {new Date(invite.expiresAt).toLocaleString()}</span>
                    </div>
                    <div className="workspace-invites__actions">
                      <button type="button" className="workspace-button workspace-button--ghost" onClick={() => setInviteLink(buildInviteLink(invite.token))}>
                        Copy link
                      </button>
                      <button type="button" className="workspace-button workspace-button--ghost" onClick={() => handleRevokeInvite(invite.id)}>
                        Revoke
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
};

export default WorkspaceAdminPanel;
