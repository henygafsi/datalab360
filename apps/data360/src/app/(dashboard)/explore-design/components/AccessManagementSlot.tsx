'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Input, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  UserPlus, Users, Crown, Pencil, Eye, Trash2,
  X, Check, Loader2, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { formatDistanceToNow } from 'date-fns';
import {
  listContributors,
  addContributor,
  removeContributor,
} from '@/app/services/api/projectsApi';
import type { Contributor, ContributorRole } from '@/app/services/api/types';
import { getApiErrorMessage } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Role Configuration
// ---------------------------------------------------------------------------

const ROLE_CONFIG: Record<
  ContributorRole,
  {
    icon: React.ElementType;
    label: string;
    badgeClass: string;
    avatarClass: string;
  }
> = {
  owner: {
    icon: Crown,
    label: 'Owner',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    avatarClass: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white',
  },
  editor: {
    icon: Pencil,
    label: 'Editor',
    badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    avatarClass: 'bg-gradient-to-br from-blue-400 to-indigo-500 text-white',
  },
  viewer: {
    icon: Eye,
    label: 'Viewer',
    badgeClass: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    avatarClass: 'bg-gradient-to-br from-slate-400 to-gray-500 text-white',
  },
};

function getInitials(username: string): string {
  return username
    .split(/[._\-@]/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ---------------------------------------------------------------------------
// Contributor Row
// ---------------------------------------------------------------------------

function ContributorRow({
  contributor,
  isCurrentUser,
  canManage,
  confirmingRemove,
  onConfirmRemove,
  onCancelRemove,
  onRemove,
}: {
  contributor: Contributor;
  isCurrentUser: boolean;
  canManage: boolean;
  confirmingRemove: boolean;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  onRemove: () => void;
}) {
  const config = ROLE_CONFIG[contributor.role];
  const Icon = config.icon;
  const isOwner = contributor.role === 'owner';
  const canBeRemoved = canManage && !isOwner && !isCurrentUser;

  if (confirmingRemove) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/50 px-3 py-2 animate-in fade-in duration-200">
        <Trash2 className="h-3.5 w-3.5 text-red-500 shrink-0" />
        <span className="text-sm text-red-700 dark:text-red-300 flex-1 truncate">
          Remove <strong>{contributor.username}</strong>?
        </span>
        <Button
          size="sm"
          className="h-6 px-2 text-xs bg-red-600 hover:bg-red-700 text-white"
          onClick={onRemove}
        >
          <Check className="h-3 w-3 mr-1" />
          Yes
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          onClick={onCancelRemove}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      {/* Avatar */}
      <div
        className={cn(
          'h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 shadow-sm',
          config.avatarClass,
        )}
      >
        {getInitials(contributor.username)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
            {contributor.username}
          </span>
          {isCurrentUser && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">
              you
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded-full', config.badgeClass)}>
            <Icon className="h-2.5 w-2.5" />
            {config.label}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {contributor.added_by ? `by ${contributor.added_by}` : ''}
            {contributor.added_at && !isNaN(new Date(contributor.added_at).getTime())
              ? ` ${formatDistanceToNow(new Date(contributor.added_at), { addSuffix: true })}`
              : ''}
          </span>
        </div>
      </div>

      {/* Remove button */}
      {canBeRemoved && (
        <Tooltip content={`Remove ${contributor.username}`} placement="left">
          <button
            onClick={onConfirmRemove}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface AccessManagementSlotProps {
  projectId: string;
}

const AccessManagementSlot: React.FC<AccessManagementSlotProps> = ({ projectId }) => {
  const { data: session } = useSession();
  const currentUsername = (session?.user as any)?.username || '';

  // Data state
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('viewer');
  const [isAdding, setIsAdding] = useState(false);

  // Remove confirmation
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // Derived
  const roleCounts = useMemo(() => {
    const counts = { owner: 0, editor: 0, viewer: 0 };
    contributors.forEach((c) => counts[c.role]++);
    return counts;
  }, [contributors]);

  const sortedContributors = useMemo(() => {
    const roleOrder: Record<ContributorRole, number> = { owner: 0, editor: 1, viewer: 2 };
    return [...contributors].sort((a, b) => {
      const diff = roleOrder[a.role] - roleOrder[b.role];
      if (diff !== 0) return diff;
      return a.username.localeCompare(b.username);
    });
  }, [contributors]);

  const currentUserRole = useMemo(() => {
    return contributors.find((c) => c.username === currentUsername)?.role ?? null;
  }, [contributors, currentUsername]);

  const canManage = currentUserRole === 'owner' || currentUserRole === 'editor';

  // Fetch
  const fetchContributors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listContributors(projectId);
      setContributors(data);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchContributors();
  }, [fetchContributors]);

  // Handlers
  const handleAdd = async () => {
    const username = newUsername.trim();
    if (!username) {
      toast.error('Username is required');
      return;
    }
    setIsAdding(true);
    try {
      const added = await addContributor(projectId, { username, role: newRole });
      setContributors((prev) => [...prev, added]);
      toast.success(`Added ${added.username} as ${added.role}`);
      setNewUsername('');
      setShowAddForm(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (username: string) => {
    setIsRemoving(true);
    try {
      await removeContributor(projectId, username);
      setContributors((prev) => prev.filter((c) => c.username !== username));
      toast.success(`Removed ${username} from project`);
      setConfirmRemove(null);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setIsRemoving(false);
    }
  };

  // ---------- Loading state ----------
  if (loading) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading contributors...
      </div>
    );
  }

  // ---------- Error state ----------
  if (error) {
    return (
      <div className="p-4 space-y-2">
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
        <Button size="sm" variant="outline" onClick={fetchContributors} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  // ---------- Normal state ----------
  return (
    <div className="p-4 space-y-3">
      {/* ── Section A: Summary Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {roleCounts.owner > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <Crown className="h-3 w-3" />
              {roleCounts.owner}
            </span>
          )}
          {roleCounts.editor > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 dark:text-blue-400">
              <Pencil className="h-3 w-3" />
              {roleCounts.editor}
            </span>
          )}
          {roleCounts.viewer > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              <Eye className="h-3 w-3" />
              {roleCounts.viewer}
            </span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {contributors.length} member{contributors.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {canManage && (
            <Tooltip content="Add contributor">
              <Button
                size="sm"
                variant={showAddForm ? 'solid' : 'outline'}
                className={cn(
                  'h-7 w-7 p-0',
                  showAddForm && 'bg-blue-600 text-white hover:bg-blue-700',
                )}
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  setNewUsername('');
                }}
              >
                {showAddForm ? <X className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Refresh">
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0"
              onClick={fetchContributors}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* ── Section B: Inline Add Form ── */}
      {showAddForm && (
        <div className="rounded-lg border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 p-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <Input
            size="sm"
            placeholder="Enter username..."
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            disabled={isAdding}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newUsername.trim()) handleAdd();
            }}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5">
              <button
                onClick={() => setNewRole('viewer')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  newRole === 'viewer'
                    ? 'bg-slate-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                <Eye className="h-3 w-3" />
                Viewer
              </button>
              <button
                onClick={() => setNewRole('editor')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                  newRole === 'editor'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                <Pencil className="h-3 w-3" />
                Editor
              </button>
            </div>
            <Button
              size="sm"
              className="h-7 gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs"
              onClick={handleAdd}
              disabled={isAdding || !newUsername.trim()}
            >
              {isAdding ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Add
            </Button>
          </div>
        </div>
      )}

      {/* ── Section C: Contributor List ── */}
      {sortedContributors.length === 0 ? (
        <div className="py-6 text-center">
          <Users className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No contributors yet. Add team members to collaborate.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {sortedContributors.map((contributor) => (
            <ContributorRow
              key={contributor.contributor_id}
              contributor={contributor}
              isCurrentUser={contributor.username === currentUsername}
              canManage={canManage}
              confirmingRemove={confirmRemove === contributor.username}
              onConfirmRemove={() => setConfirmRemove(contributor.username)}
              onCancelRemove={() => setConfirmRemove(null)}
              onRemove={() => handleRemove(contributor.username)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default AccessManagementSlot;
