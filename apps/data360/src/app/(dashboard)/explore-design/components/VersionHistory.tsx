'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Tooltip, Modal } from 'rizzui';
import {
  History, GitBranch, GitCommit, ChevronDown, ChevronRight, Check, X,
  Clock, Calendar, User, Download, Eye, RotateCcw, ArrowRight, Plus,
  Minus, Edit2, Database, Layers, Shield, RefreshCw, Archive, Tag,
  ArrowUpDown, Filter, Search
} from 'lucide-react';
import { useVersionStore, Version, VersionComparison, VersionType, getVersionTypeLabel, formatVersionDisplay } from '../stores/version-store';
import { formatDistanceToNow, format } from 'date-fns';
import { useCanPerform } from '@/hooks/useCanPerform';

// Version status config
const statusConfig = {
  draft: { color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400', icon: Edit2 },
  published: { color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400', icon: Tag },
  deployed: { color: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400', icon: Check },
  archived: { color: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400', icon: Archive },
  deprecated: { color: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400', icon: X },
};

// Change type config
const changeTypeConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  column_added: { icon: Plus, color: 'text-green-500', label: 'Column Added' },
  column_removed: { icon: Minus, color: 'text-red-500', label: 'Column Removed' },
  ingestion_changed: { icon: RefreshCw, color: 'text-blue-500', label: 'Ingestion Changed' },
  policy_added: { icon: Shield, color: 'text-purple-500', label: 'Policy Added' },
  policy_removed: { icon: Shield, color: 'text-amber-500', label: 'Policy Removed' },
  table_added: { icon: Database, color: 'text-green-500', label: 'Table Added' },
  table_removed: { icon: Database, color: 'text-red-500', label: 'Table Removed' },
};

interface VersionHistoryProps {
  projectId?: string;
  className?: string;
  compact?: boolean;
}

const VersionHistory: React.FC<VersionHistoryProps> = ({
  projectId,
  className,
  compact = false,
}) => {
  const {
    versions,
    versionHistory,
    latestVersion,
    getVersionsByProject,
    compareVersions,
    publishVersion,
    archiveVersion,
    setCurrentVersion,
  } = useVersionStore();

  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set());
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareFrom, setCompareFrom] = useState<string>('');
  const [compareTo, setCompareTo] = useState<string>('');
  const [comparison, setComparison] = useState<VersionComparison | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Action-level RBAC for destructive version actions
  const approvePerm = useCanPerform('explore_design', 'approve');
  const archivePerm = useCanPerform('explore_design', 'archive');
  const canPublish = approvePerm.allowed || approvePerm.loading;
  const canArchive = archivePerm.allowed || archivePerm.loading;

  // Get versions based on project
  const displayVersions = useMemo(() => {
    let vers = projectId ? getVersionsByProject(projectId) : versionHistory;

    // Apply search
    if (searchQuery) {
      vers = vers.filter((v) =>
        v.version.includes(searchQuery) ||
        v.changelog.summary.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply filter
    if (filterStatus !== 'all') {
      vers = vers.filter((v) => v.status === filterStatus);
    }

    return vers;
  }, [projectId, versionHistory, getVersionsByProject, searchQuery, filterStatus]);

  // Toggle version expand
  const toggleExpand = useCallback((versionId: string) => {
    setExpandedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(versionId)) {
        next.delete(versionId);
      } else {
        next.add(versionId);
      }
      return next;
    });
  }, []);

  // Handle compare
  const handleCompare = useCallback(() => {
    if (!compareFrom || !compareTo) return;
    const result = compareVersions({ from_version_id: compareFrom, to_version_id: compareTo });
    setComparison(result);
  }, [compareFrom, compareTo, compareVersions]);

  // Open compare modal
  const openCompareModal = useCallback((fromId: string, toId?: string) => {
    setCompareFrom(fromId);
    setCompareTo(toId || latestVersion?.version_id || '');
    setShowCompareModal(true);
  }, [latestVersion]);

  if (compact) {
    // Compact timeline view
    return (
      <div className={cn('rounded-lg border dark:border-slate-700', className)}>
        <div className="px-4 py-3 border-b dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold">Version History</h3>
          </div>
          {latestVersion && (
            <Badge className="bg-green-100 text-green-700">
              v{latestVersion.version}
            </Badge>
          )}
        </div>

        <div className="p-4">
          {displayVersions.length === 0 ? (
            <div className="text-center py-6 text-slate-500">
              <History className="h-8 w-8 mx-auto mb-2 text-slate-300" />
              <p className="text-sm">No versions yet</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

              <div className="space-y-4">
                {displayVersions.slice(0, 5).map((version, idx) => {
                  const status = statusConfig[version.status];

                  return (
                    <div key={version.version_id} className="relative pl-10">
                      {/* Timeline dot */}
                      <div
                        className={cn(
                          'absolute left-2 w-5 h-5 rounded-full flex items-center justify-center',
                          idx === 0 ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                        )}
                      >
                        <GitCommit className="h-3 w-3 text-white" />
                      </div>

                      <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">v{version.version}</span>
                          <Badge size="sm" className={status.color}>
                            {version.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 line-clamp-1">
                          {version.changelog.summary}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {formatDistanceToNow(new Date(version.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {displayVersions.length > 5 && (
            <Button variant="text" size="sm" className="w-full mt-4">
              View all {displayVersions.length} versions
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className={cn('rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-900', className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b dark:border-slate-700 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GitBranch className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-bold">Version History</h2>
              <p className="text-sm text-purple-100">
                Track changes across deployments
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {latestVersion && (
              <Badge className="bg-white/20 text-white">
                Latest: v{latestVersion.version}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-white border-white/30 hover:bg-white/10"
              onClick={() => openCompareModal('', '')}
            >
              <ArrowUpDown className="h-4 w-4 mr-1" />
              Compare
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 border-b dark:border-slate-700 flex items-center gap-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search versions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm dark:bg-slate-800 dark:border-slate-700"
          >
            <option value="all">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="deployed">Deployed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {displayVersions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <History className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-slate-500">No versions found</p>
            <p className="text-sm text-slate-400 mt-1">Create your first version to start tracking changes</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

            <div className="space-y-4">
              {displayVersions.map((version, idx) => {
                const status = statusConfig[version.status];
                const isExpanded = expandedVersions.has(version.version_id);
                const isLatest = idx === 0 && version.status === 'deployed';

                return (
                  <div key={version.version_id} className="relative pl-14">
                    {/* Timeline node */}
                    <div
                      className={cn(
                        'absolute left-4 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900',
                        isLatest
                          ? 'bg-green-500'
                          : version.status === 'deployed'
                          ? 'bg-blue-500'
                          : version.status === 'draft'
                          ? 'bg-slate-300 dark:bg-slate-600'
                          : 'bg-slate-400'
                      )}
                    >
                      <GitCommit className="h-3 w-3 text-white" />
                    </div>

                    <div
                      className={cn(
                        'border dark:border-slate-700 rounded-lg overflow-hidden',
                        isLatest && 'ring-2 ring-green-500 ring-offset-2 dark:ring-offset-slate-900'
                      )}
                    >
                      {/* Version Header */}
                      <div
                        className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                        onClick={() => toggleExpand(version.version_id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button className="p-0.5">
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-slate-400" />
                              )}
                            </button>

                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-lg">v{version.version}</span>
                                <Badge className={status.color}>
                                  <status.icon className="h-3 w-3 mr-1" />
                                  {version.status}
                                </Badge>
                                {isLatest && (
                                  <Badge className="bg-green-500 text-white">Latest</Badge>
                                )}
                              </div>
                              <p className="text-sm text-slate-500 mt-0.5">
                                {version.changelog.summary}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-sm text-slate-500">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {format(new Date(version.created_at), 'MMM d, yyyy')}
                            </div>
                            <div className="flex items-center gap-1">
                              <User className="h-4 w-4" />
                              {version.created_by}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="p-4 space-y-4">
                          {/* Changes List */}
                          <div>
                            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Layers className="h-4 w-4" />
                              Changes ({version.changelog.changes.length})
                            </h4>

                            {version.changelog.changes.length === 0 ? (
                              <p className="text-sm text-slate-500">No changes recorded</p>
                            ) : (
                              <div className="space-y-2">
                                {version.changelog.changes.map((change, cIdx) => {
                                  const changeType = changeTypeConfig[change.type] || {
                                    icon: Edit2,
                                    color: 'text-slate-500',
                                    label: change.type,
                                  };

                                  return (
                                    <div
                                      key={cIdx}
                                      className="flex items-center gap-3 p-2 bg-slate-50 dark:bg-slate-800/50 rounded"
                                    >
                                      <changeType.icon className={cn('h-4 w-4', changeType.color)} />
                                      <div className="flex-1">
                                        <span className="text-sm">{changeType.label}</span>
                                        {change.table && (
                                          <span className="text-sm text-slate-500 ml-2">
                                            on {change.table}
                                            {change.column && `.${change.column}`}
                                          </span>
                                        )}
                                      </div>
                                      {change.from && change.to && (
                                        <div className="flex items-center gap-2 text-xs">
                                          <Badge size="sm" className="bg-red-100 text-red-600">{change.from}</Badge>
                                          <ArrowRight className="h-3 w-3 text-slate-400" />
                                          <Badge size="sm" className="bg-green-100 text-green-600">{change.to}</Badge>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Deployment Info */}
                          {version.deployed_at && (
                            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                <Check className="h-4 w-4" />
                                <span className="text-sm font-medium">
                                  Deployed to {version.environment || 'production'}
                                </span>
                              </div>
                              <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                                {format(new Date(version.deployed_at), 'PPpp')} by {version.deployed_by}
                              </p>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center justify-between pt-4 border-t dark:border-slate-700">
                            <div className="flex items-center gap-2">
                              {version.previous_version && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const prevVer = versions.find((v) => v.version === version.previous_version);
                                    if (prevVer) openCompareModal(prevVer.version_id, version.version_id);
                                  }}
                                >
                                  <ArrowUpDown className="h-4 w-4 mr-1" />
                                  Compare with Previous
                                </Button>
                              )}
                              <Button variant="outline" size="sm">
                                <Eye className="h-4 w-4 mr-1" />
                                View Snapshot
                              </Button>
                            </div>

                            <div className="flex items-center gap-2">
                              {version.status === 'draft' && (
                                <Button
                                  size="sm"
                                  disabled={!canPublish}
                                  title={!canPublish ? "You lack the 'approve' permission on explore_design. Ask an administrator to grant it." : undefined}
                                  onClick={() => publishVersion(version.version_id)}
                                >
                                  <Tag className="h-4 w-4 mr-1" />
                                  Publish
                                </Button>
                              )}
                              {version.status === 'deployed' && (
                                <Tooltip content="Rollback to this version">
                                  <Button variant="outline" size="sm">
                                    <RotateCcw className="h-4 w-4 mr-1" />
                                    Rollback
                                  </Button>
                                </Tooltip>
                              )}
                              {(version.status === 'published' || version.status === 'deployed') && (
                                <Tooltip
                                  content={
                                    !canArchive
                                      ? "You lack the 'archive' permission on explore_design. Ask an administrator to grant it."
                                      : 'Archive this version'
                                  }
                                >
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={!canArchive}
                                    onClick={() => archiveVersion(version.version_id)}
                                  >
                                    <Archive className="h-4 w-4" />
                                  </Button>
                                </Tooltip>
                              )}
                              <Button variant="outline" size="sm">
                                <Download className="h-4 w-4 mr-1" />
                                Export
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Compare Modal */}
      <Modal isOpen={showCompareModal} onClose={() => setShowCompareModal(false)}>
        <div className="p-6 max-w-2xl">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Compare Versions
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium">From Version</label>
              <select
                value={compareFrom}
                onChange={(e) => setCompareFrom(e.target.value)}
                className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="">Select version...</option>
                {versions.map((v) => (
                  <option key={v.version_id} value={v.version_id}>
                    {formatVersionDisplay(v)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">To Version</label>
              <select
                value={compareTo}
                onChange={(e) => setCompareTo(e.target.value)}
                className="w-full mt-1 p-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="">Select version...</option>
                {versions.map((v) => (
                  <option key={v.version_id} value={v.version_id}>
                    {formatVersionDisplay(v)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Button
            className="w-full mb-4"
            onClick={handleCompare}
            disabled={!compareFrom || !compareTo}
          >
            Compare
          </Button>

          {comparison && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <Badge size="lg">v{comparison.from_version}</Badge>
                <ArrowRight className="h-5 w-5 text-slate-400" />
                <Badge size="lg" className="bg-blue-100 text-blue-700">v{comparison.to_version}</Badge>
              </div>

              {/* Diff Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {comparison.diff.tables_added.length + comparison.diff.columns_added.length}
                  </p>
                  <p className="text-xs text-slate-500">Added</p>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                  <p className="text-2xl font-bold text-amber-600">
                    {comparison.diff.tables_modified.length}
                  </p>
                  <p className="text-xs text-slate-500">Modified</p>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {comparison.diff.tables_removed.length + comparison.diff.columns_removed.length}
                  </p>
                  <p className="text-xs text-slate-500">Removed</p>
                </div>
              </div>

              {/* Detail List */}
              {comparison.diff.tables_added.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Plus className="h-4 w-4 text-green-500" />
                    Tables Added
                  </h4>
                  <div className="space-y-1">
                    {comparison.diff.tables_added.map((t) => (
                      <div key={t} className="text-sm p-2 bg-green-50 dark:bg-green-900/20 rounded">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {comparison.diff.tables_removed.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Minus className="h-4 w-4 text-red-500" />
                    Tables Removed
                  </h4>
                  <div className="space-y-1">
                    {comparison.diff.tables_removed.map((t) => (
                      <div key={t} className="text-sm p-2 bg-red-50 dark:bg-red-900/20 rounded">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {comparison.diff.tables_modified.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Edit2 className="h-4 w-4 text-amber-500" />
                    Tables Modified
                  </h4>
                  <div className="space-y-2">
                    {comparison.diff.tables_modified.map((t) => (
                      <div key={t.table} className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded">
                        <p className="font-medium text-sm">{t.table}</p>
                        <div className="mt-2 space-y-1">
                          {t.changes.map((c, idx) => (
                            <div key={idx} className="text-xs text-slate-600 dark:text-slate-400">
                              {c.type}: {c.column || c.from} {c.to ? `→ ${c.to}` : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => setShowCompareModal(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default VersionHistory;
