'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Rocket,
  CheckCircle,
  XCircle,
  Clock,
  User,
  AlertTriangle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Calendar,
  Play,
  RefreshCw,
  Shield,
  Layers,
  Check,
  X,
  Database,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  WorkflowDeployment,
  DeploymentStatus,
  WorkflowStep,
} from '@/app/services/workflow';

// Local storage key for workflow deployments
const WORKFLOW_DEPLOYMENTS_KEY = 'workflow-deployments';

// Helper to extract error message from various error formats (FastAPI validation, etc.)
const extractErrorMessage = (err: any): string => {
  if (!err) return 'Unknown error';

  // Check for FastAPI validation error format: {detail: [{type, loc, msg, input}]}
  const detail = err.response?.data?.detail;
  if (detail) {
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      // FastAPI validation errors
      return detail.map((d: any) => d.msg || d.message || JSON.stringify(d)).join('; ');
    }
    if (typeof detail === 'object' && detail.msg) return detail.msg;
    if (typeof detail === 'object') return JSON.stringify(detail);
  }

  // Standard error message
  if (err.message) return err.message;

  return 'An error occurred';
};

// Local deployment interface (stored in localStorage)
interface LocalDeployment {
  event_id: string;
  workflow_id: string;
  workflow_name: string;
  status: DeploymentStatus;
  deployment_type: 'immediate' | 'scheduled' | 'approval';
  scheduled_date?: string;
  steps: WorkflowStep[];
  created_by: string;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  executed_at?: string;
  description?: string;
}

interface DeploymentHistoryProps {
  workflowId: string;
  workflowName: string;
  onRefresh?: () => void;
  className?: string;
}

// Helper to get deployments from localStorage
const getLocalDeployments = (): LocalDeployment[] => {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(WORKFLOW_DEPLOYMENTS_KEY);
    return (stored ? JSON.parse(stored) : []) as LocalDeployment[];
  } catch {
    return [];
  }
};

// Helper to save deployments to localStorage
const saveLocalDeployments = (deployments: LocalDeployment[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(WORKFLOW_DEPLOYMENTS_KEY, JSON.stringify(deployments));
};

// Helper to add a deployment to localStorage
export const addLocalDeployment = (deployment: LocalDeployment) => {
  const deployments = getLocalDeployments();
  deployments.unshift(deployment); // Add to beginning
  saveLocalDeployments(deployments);
};

// Helper to update a deployment status in localStorage
const updateLocalDeploymentStatus = (eventId: string, status: DeploymentStatus, updates: Partial<LocalDeployment> = {}) => {
  const deployments = getLocalDeployments();
  const index = deployments.findIndex(d => d.event_id === eventId);
  if (index !== -1) {
    deployments[index] = { ...deployments[index], status, ...updates };
    saveLocalDeployments(deployments);
  }
};

const DeploymentHistory: React.FC<DeploymentHistoryProps> = ({
  workflowId,
  workflowName,
  onRefresh,
  className,
}) => {
  const [deployments, setDeployments] = useState<LocalDeployment[]>([]);
  const [totalDeployments, setTotalDeployments] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDeployments, setExpandedDeployments] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<DeploymentStatus | ''>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDeployments = useCallback(() => {
    setIsLoading(true);
    setError(null);
    try {
      // Get deployments from localStorage
      let localDeployments = getLocalDeployments();

      // Filter for current workflow
      localDeployments = localDeployments.filter(
        (d) => d.workflow_id === workflowId || d.workflow_name === workflowName
      );

      // Apply status filter
      if (statusFilter) {
        localDeployments = localDeployments.filter(d => d.status === statusFilter);
      }

      setDeployments(localDeployments);
      setTotalDeployments(localDeployments.length);
    } catch (err: any) {
      console.error('Failed to fetch deployments:', err);
      setError(extractErrorMessage(err) || 'Failed to load deployment history');
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, workflowName, statusFilter]);

  useEffect(() => {
    fetchDeployments();
  }, [fetchDeployments]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchDeployments();
    setIsRefreshing(false);
    onRefresh?.();
  };

  const toggleDeploymentExpanded = (deploymentId: string) => {
    setExpandedDeployments((prev) => {
      const next = new Set(prev);
      if (next.has(deploymentId)) {
        next.delete(deploymentId);
      } else {
        next.add(deploymentId);
      }
      return next;
    });
  };

  const handleApprove = async (eventId: string) => {
    setActionLoading(eventId);
    try {
      updateLocalDeploymentStatus(eventId, 'APPROVED', {
        approved_by: 'Current User',
        approved_at: new Date().toISOString(),
      });
      fetchDeployments();
    } catch (err: any) {
      setError(extractErrorMessage(err) || 'Failed to approve deployment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (eventId: string) => {
    const reason = prompt('Please provide a reason for rejection (optional):');
    setActionLoading(eventId);
    try {
      updateLocalDeploymentStatus(eventId, 'REJECTED');
      fetchDeployments();
    } catch (err: any) {
      setError(extractErrorMessage(err) || 'Failed to reject deployment');
    } finally {
      setActionLoading(null);
    }
  };

  const handleActivate = async (eventId: string) => {
    setActionLoading(eventId);
    try {
      updateLocalDeploymentStatus(eventId, 'ACTIVE', {
        executed_at: new Date().toISOString(),
      });
      fetchDeployments();
    } catch (err: any) {
      setError(extractErrorMessage(err) || 'Failed to activate deployment');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusIcon = (status: DeploymentStatus) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4 text-blue-500" />;
      case 'REJECTED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'ACTIVE':
        return <Play className="h-4 w-4 text-green-500" />;
      case 'SCHEDULED':
        return <Calendar className="h-4 w-4 text-purple-500" />;
      default:
        return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: DeploymentStatus) => {
    const styles: Record<DeploymentStatus, string> = {
      PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
      APPROVED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      SCHEDULED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    };
    return (
      <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', styles[status])}>
        {getStatusIcon(status)}
        {status.replace('_', ' ')}
      </span>
    );
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDeploymentStats = () => {
    const allDeployments = getLocalDeployments().filter(
      (d) => d.workflow_id === workflowId || d.workflow_name === workflowName
    );
    const pending = allDeployments.filter((d) => d.status === 'PENDING_APPROVAL').length;
    const approved = allDeployments.filter((d) => d.status === 'APPROVED').length;
    const active = allDeployments.filter((d) => d.status === 'ACTIVE').length;
    const rejected = allDeployments.filter((d) => d.status === 'REJECTED').length;
    return { pending, approved, active, rejected };
  };

  const getActions = (status: DeploymentStatus): ('approve' | 'reject' | 'activate')[] => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return ['approve', 'reject'];
      case 'APPROVED':
        return ['activate'];
      default:
        return [];
    }
  };

  const stats = getDeploymentStats();

  if (isLoading && deployments.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        <span className="ml-2 text-slate-500">Loading deployment history...</span>
      </div>
    );
  }

  return (
    <div className={cn('bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Deployment History</h3>
          {totalDeployments > 0 && (
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full">
              {totalDeployments} deployments
            </span>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', isRefreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Stats Summary */}
      {(stats.pending > 0 || stats.approved > 0 || stats.active > 0 || stats.rejected > 0) && (
        <div className="grid grid-cols-4 gap-4 p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-xs text-slate-500">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.approved}</div>
            <div className="text-xs text-slate-500">Approved</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <div className="text-xs text-slate-500">Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
            <div className="text-xs text-slate-500">Rejected</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 p-3 border-b border-slate-200 dark:border-slate-700">
        <span className="text-sm text-slate-500">Filter:</span>
        {(['', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'REJECTED'] as const).map((status) => (
          <button
            key={status || 'all'}
            onClick={() => setStatusFilter(status)}
            className={cn(
              'px-2 py-1 text-xs rounded-lg transition-colors',
              statusFilter === status
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            )}
          >
            {status ? status.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Local Storage Notice */}
      <div className="mx-4 mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
          <Database className="h-4 w-4" />
          <span className="text-xs">Deployment history is stored locally. Data persists across page reloads.</span>
        </div>
      </div>

      {/* Deployments List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
        {deployments.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">
            <Rocket className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No deployment history yet</p>
            <p className="text-sm mt-1">Deploy the workflow to see deployment logs</p>
          </div>
        ) : (
          deployments.map((deployment) => {
            const isExpanded = expandedDeployments.has(deployment.event_id);
            const isActionLoading = actionLoading === deployment.event_id;
            const actions = getActions(deployment.status);

            return (
              <div
                key={deployment.event_id}
                className={cn(
                  'p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors',
                  deployment.status === 'PENDING_APPROVAL' && 'bg-yellow-50/30 dark:bg-yellow-900/10'
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleDeploymentExpanded(deployment.event_id)}
                        className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>
                      {getStatusBadge(deployment.status)}
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {deployment.workflow_name || deployment.event_id.slice(-8)}
                      </span>
                      <span className="text-xs text-slate-400 capitalize">
                        ({deployment.deployment_type})
                      </span>
                    </div>
                    <div className="flex items-center flex-wrap gap-3 mt-1 ml-6 text-xs text-slate-500 dark:text-slate-400">
                      {deployment.created_by && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {deployment.created_by}
                        </span>
                      )}
                      {deployment.created_at && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(deployment.created_at)}
                        </span>
                      )}
                      {deployment.scheduled_date && deployment.status === 'SCHEDULED' && (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Scheduled: {formatDate(deployment.scheduled_date)}
                        </span>
                      )}
                      {deployment.steps && deployment.steps.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {deployment.steps.length} steps
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {actions.includes('approve') && (
                      <button
                        onClick={() => handleApprove(deployment.event_id)}
                        disabled={isActionLoading}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isActionLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Approve
                      </button>
                    )}
                    {actions.includes('reject') && (
                      <button
                        onClick={() => handleReject(deployment.event_id)}
                        disabled={isActionLoading}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isActionLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <X className="h-3 w-3" />
                        )}
                        Reject
                      </button>
                    )}
                    {actions.includes('activate') && (
                      <button
                        onClick={() => handleActivate(deployment.event_id)}
                        disabled={isActionLoading}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isActionLoading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                        Activate
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="mt-3 ml-6 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500">Deployment ID:</span>
                        <code className="ml-1 font-mono text-slate-700 dark:text-slate-300 break-all">
                          {deployment.event_id}
                        </code>
                      </div>
                      <div>
                        <span className="text-slate-500">Workflow ID:</span>
                        <code className="ml-1 font-mono text-slate-700 dark:text-slate-300">
                          {deployment.workflow_id || 'N/A'}
                        </code>
                      </div>
                      {deployment.approved_by && (
                        <div>
                          <span className="text-slate-500">Approved by:</span>
                          <span className="ml-1 text-slate-700 dark:text-slate-300">
                            {deployment.approved_by}
                          </span>
                        </div>
                      )}
                      {deployment.approved_at && (
                        <div>
                          <span className="text-slate-500">Approved at:</span>
                          <span className="ml-1 text-slate-700 dark:text-slate-300">
                            {formatDate(deployment.approved_at)}
                          </span>
                        </div>
                      )}
                      {deployment.executed_at && (
                        <div>
                          <span className="text-slate-500">Executed at:</span>
                          <span className="ml-1 text-slate-700 dark:text-slate-300">
                            {formatDate(deployment.executed_at)}
                          </span>
                        </div>
                      )}
                      {deployment.description && (
                        <div className="col-span-2">
                          <span className="text-slate-500">Description:</span>
                          <span className="ml-1 text-slate-700 dark:text-slate-300">
                            {deployment.description}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Steps List */}
                    {deployment.steps && deployment.steps.length > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 mb-1">
                          <Layers className="h-3 w-3" />
                          Workflow Steps ({deployment.steps.length})
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {deployment.steps.map((step: WorkflowStep, index: number) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-xs"
                            >
                              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium">
                                {step.step_order}
                              </span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">
                                {step.action_type}
                              </span>
                              {step.payload && Object.keys(step.payload).length > 0 && (
                                <span className="text-slate-500 truncate">
                                  {Object.entries(step.payload)
                                    .slice(0, 2)
                                    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : '...'}`)
                                    .join(', ')}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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

export default DeploymentHistory;
