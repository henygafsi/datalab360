'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  GitBranch,
  Check,
  Archive,
  AlertCircle,
  Loader2,
  Plus,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getWorkflowVersions,
  createWorkflowVersion,
  rollbackWorkflow,
  WorkflowVersion,
  formatDuration,
} from '@/app/services/workflow';

// Helper to extract error message (ApiResponse.error, FastAPI detail, etc.)
const extractErrorMessage = (err: any): string => {
  if (!err) return 'Unknown error';
  const errObj = err.response?.data?.error;
  if (errObj && typeof errObj === 'object' && (errObj.message != null || errObj.error_code != null)) {
    return typeof errObj.message === 'string' ? errObj.message : String(errObj.error_code ?? errObj.message ?? 'Error');
  }
  const detail = err.response?.data?.detail;
  if (detail !== undefined && detail !== null) {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; ');
    if (typeof detail === 'object' && (detail.message ?? detail.msg)) return String(detail.message ?? detail.msg);
    if (typeof detail === 'object') return JSON.stringify(detail);
  }
  if (err.message && typeof err.message === 'string') return err.message;
  return 'An error occurred';
};

interface VersionHistoryProps {
  workflowId: string;
  workflowName: string;
  onVersionChange?: () => void;
  className?: string;
}

const VersionHistory: React.FC<VersionHistoryProps> = ({
  workflowId,
  workflowName,
  onVersionChange,
  className,
}) => {
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<WorkflowVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [isCreatingVersion, setIsCreatingVersion] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newVersionName, setNewVersionName] = useState('');
  const [newVersionDescription, setNewVersionDescription] = useState('');

  const fetchVersions = useCallback(async () => {
    if (!workflowId) return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await getWorkflowVersions(workflowId, { limit: 20, include_rolled_back: true });
      setVersions(data.versions || []);
      setCurrentVersion(data.current_version);
    } catch (err: any) {
      console.error('Failed to fetch versions:', err);
      setError(extractErrorMessage(err) || 'Failed to load version history');
    } finally {
      setIsLoading(false);
    }
  }, [workflowId]);

  useEffect(() => {
    fetchVersions();
  }, [fetchVersions]);

  const handleCreateVersion = async () => {
    if (!workflowId) return;

    setIsCreatingVersion(true);
    try {
      await createWorkflowVersion(workflowId, {
        version_name: newVersionName || undefined,
        description: newVersionDescription || undefined,
      });
      setNewVersionName('');
      setNewVersionDescription('');
      setShowCreateForm(false);
      await fetchVersions();
      onVersionChange?.();
    } catch (err: any) {
      console.error('Failed to create version:', err);
      setError(extractErrorMessage(err) || 'Failed to create version');
    } finally {
      setIsCreatingVersion(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!workflowId) return;

    const reason = prompt('Please provide a reason for rollback (optional):');

    setIsRollingBack(versionId);
    try {
      await rollbackWorkflow(workflowId, versionId, reason || undefined);
      await fetchVersions();
      onVersionChange?.();
    } catch (err: any) {
      console.error('Failed to rollback:', err);
      setError(extractErrorMessage(err) || 'Failed to rollback to version');
    } finally {
      setIsRollingBack(null);
    }
  };

  const toggleVersionExpanded = (versionId: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      superseded: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      rolled_back: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    };
    const icons: Record<string, React.ReactNode> = {
      active: <Check className="h-3 w-3" />,
      superseded: <Archive className="h-3 w-3" />,
      rolled_back: <RotateCcw className="h-3 w-3" />,
    };
    return (
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', styles[status])}>
        {icons[status]}
        {status.replace('_', ' ')}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-500">Loading version history...</span>
      </div>
    );
  }

  return (
    <div className={cn('bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Version History</h3>
          {versions.length > 0 && (
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
              {versions.length} versions
            </span>
          )}
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Snapshot
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Create Version Form */}
      {showCreateForm && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Version Name (optional)
              </label>
              <input
                type="text"
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                placeholder="e.g., Before production deploy"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Description (optional)
              </label>
              <textarea
                value={newVersionDescription}
                onChange={(e) => setNewVersionDescription(e.target.value)}
                placeholder="Describe the changes in this version..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateVersion}
                disabled={isCreatingVersion}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {isCreatingVersion ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Create Snapshot
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Current Version */}
      {currentVersion && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-blue-50/50 dark:bg-blue-900/10">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <GitBranch className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  Current: {currentVersion.version_name || `Version ${currentVersion.version_number}`}
                </span>
                {getStatusBadge(currentVersion.status)}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {currentVersion.created_by}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDate(currentVersion.created_at)}
                </span>
                <span>{currentVersion.changes_summary?.steps_count || 0} steps</span>
              </div>
              {currentVersion.description && (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{currentVersion.description}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Version List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
        {versions.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No version history yet</p>
            <p className="text-sm mt-1">Create a snapshot to start tracking changes</p>
          </div>
        ) : (
          versions.map((version) => {
            const isExpanded = expandedVersions.has(version.version_id);
            const isCurrent = version.status === 'active';

            return (
              <div
                key={version.version_id}
                className={cn(
                  'p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                  isCurrent && 'bg-blue-50/30 dark:bg-blue-900/10'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleVersionExpanded(version.version_id)}
                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {version.version_name || `Version ${version.version_number}`}
                      </span>
                      {getStatusBadge(version.status)}
                    </div>
                    <div className="flex items-center gap-4 mt-1 ml-6 text-xs text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {version.created_by}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(version.created_at)}
                      </span>
                      <span>{version.changes_summary?.steps_count || 0} steps</span>
                    </div>
                  </div>

                  {/* Rollback Button */}
                  {version.can_rollback && !isCurrent && (
                    <button
                      onClick={() => handleRollback(version.version_id)}
                      disabled={isRollingBack === version.version_id}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {isRollingBack === version.version_id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Rollback
                    </button>
                  )}
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 ml-6 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                    {version.description && (
                      <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">{version.description}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500">Version ID:</span>
                        <code className="ml-1 font-mono text-slate-700 dark:text-slate-300">
                          {version.version_id.slice(0, 12)}...
                        </code>
                      </div>
                      <div>
                        <span className="text-slate-500">Steps:</span>
                        <span className="ml-1 text-slate-700 dark:text-slate-300">
                          {version.changes_summary?.steps_count || 0}
                        </span>
                      </div>
                      {version.changes_summary?.steps_added && (
                        <div>
                          <span className="text-green-600">+{version.changes_summary.steps_added} added</span>
                        </div>
                      )}
                      {version.changes_summary?.steps_removed && (
                        <div>
                          <span className="text-red-600">-{version.changes_summary.steps_removed} removed</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default VersionHistory;
