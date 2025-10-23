import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX, FormEvent } from 'react';
import type { MembershipSummary, WorkspaceSummary, WorkspaceInviteSummary } from '@taskflow/types';
import { membershipRoleSchema } from '@taskflow/types';
import { workspaceApi } from '../workspaceApi.js';
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

  const currentMembership = useMemo(() => members.find((member) => member.userId === currentUserId), [currentUserId, members]);
  const canInvite = currentMembership ? currentMembership.role === 'OWNER' || currentMembership.role === 'ADMIN' : false;
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
  };

  const loadWorkspaceData = useCallback(
    async (workspaceId: string, token: string) => {
      setMembersLoading(true);
      setMemberError('');
      setMemberNotice('');
      try {
        const [memberList, inviteList] = await Promise.all([workspaceApi.members(token, workspaceId), workspaceApi.invites(token, workspaceId)]);
        setMembers(memberList);
        setInvites(inviteList);
      } catch (exception) {
        const message = exception instanceof ApiError ? exception.message : 'Failed to load workspace access data';
        setMemberError(message);
        clearWorkspaceState();
      } finally {
        setMembersLoading(false);
      }
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
