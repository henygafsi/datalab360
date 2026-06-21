'use client';

import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Badge, Button } from 'rizzui';
import {
  Loader2, ChevronDown, ChevronRight, Clock, User, Check, X, Eye,
} from 'lucide-react';
import cn from '@core/utils/class-names';
import { listSteps } from '@/app/services/api/workflowApi';
import { listDDLActions } from '@/app/services/api/exploreDesignApi';
import { listEvents } from '@/app/services/api/projectsApi';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { createPortal } from 'react-dom';

// Lazy-load the ReactFlow canvas to avoid SSR issues
const WorkflowPreviewCanvas = dynamic(() => import('./WorkflowPreviewCanvas'), { ssr: false });

interface ApprovalDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  projectType: string;
  deploymentId: string;
  requestedBy: string;
  requestedAt: string;
  onApprove: () => void;
  onReject: () => void;
  isActionLoading: boolean;
  /** Action-RBAC gate — when false, the Approve button is hidden (Reject stays). */
  canApprove?: boolean;
}

function relativeTime(ts: string | null): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ApprovalDetailModal({
  isOpen, onClose, projectId, projectName, projectType,
  deploymentId, requestedBy, requestedAt,
  onApprove, onReject, isActionLoading, canApprove = true,
}: ApprovalDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<any[]>([]);
  const [ddlActions, setDdlActions] = useState<any[]>([]);
  const [modelEvents, setModelEvents] = useState<any[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const isWorkflow = projectType === 'workflow';

  useEffect(() => {
    if (!isOpen || !projectId) return;
    setLoading(true);
    setError(null);

    const fetchDetails = async () => {
      try {
        if (isWorkflow) {
          const res = await listSteps(projectId);
          setSteps(res.steps || []);
        } else {
          const [ddlRes, eventsRes] = await Promise.all([
            listDDLActions(projectId),
            listEvents(projectId, { limit: 50 }).catch(() => ({ events: [] })),
          ]);
          setDdlActions(ddlRes.actions || []);
          // Filter to schema-relevant events for modeling review
          const relevantTypes = ['TABLE_ADDED', 'TABLE_REMOVED', 'COLUMN_MAPPING_CREATED', 'PRIMARY_KEY_SET', 'MASKING_POLICY_SET', 'RELATIONSHIP_CREATED', 'SCHEMA_SELECTED', 'INGESTION_MODE_SET'];
          setModelEvents((eventsRes as any).events?.filter((e: any) => relevantTypes.includes(e.event_type)) || []);
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load details');
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [isOpen, projectId, isWorkflow]);

  // Close on Escape — keyboard parity, works regardless of focus position.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const toggleExpand = (index: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <div
      role="region"
      aria-modal="false"
      aria-label="Review Deployment"
      // Right-docked side panel — NO click-blocking backdrop, the page behind
      // stays interactive. Closes via the X / Cancel buttons or Escape.
      className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col border-l border-gray-200 dark:border-gray-700 motion-safe:animate-slide-in-right"
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Eye className="h-5 w-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Review Deployment</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium text-gray-900 dark:text-white">{projectName}</span>
                <Badge size="sm" variant="flat" color="info">{projectType?.replace(/_/g, ' ')}</Badge>
                <span className="flex items-center gap-1"><User className="h-3 w-3" />{requestedBy}</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{relativeTime(requestedAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={onReject} disabled={isActionLoading}
                className="bg-red-600 hover:bg-red-700 text-white">
                <X className="h-3.5 w-3.5 mr-1" />Reject
              </Button>
              {canApprove && (
                <Button size="sm" onClick={onApprove} disabled={isActionLoading}
                  className="bg-green-600 hover:bg-green-700 text-white">
                  <Check className="h-3.5 w-3.5 mr-1" />Approve
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Workflow: Read-only ReactFlow canvas */}
          {!loading && !error && isWorkflow && (
            <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}>
              <WorkflowPreviewCanvas steps={steps} />
            </Suspense>
          )}

          {/* Explore-Design DDL Actions + Model Events */}
          {!loading && !error && !isWorkflow && (
            <div className="h-full overflow-y-auto">
              {/* Link to full modeling view */}
              <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 flex items-center justify-between">
                <span className="text-xs text-blue-700 dark:text-blue-300">
                  Open the full modeling canvas for a visual review
                </span>
                <Link
                  href={`/explore-design?project_id=${projectId}`}
                  target="_blank"
                  className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Open in Explore &amp; Design →
                </Link>
              </div>

              {/* Model Events Summary */}
              {modelEvents.length > 0 && (
                <>
                  <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                      Schema Changes ({modelEvents.length})
                    </span>
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800 border-b border-gray-200 dark:border-gray-700">
                    {modelEvents.slice(0, 20).map((evt: any, i: number) => (
                      <div key={evt.event_id || i} className="flex items-center gap-3 px-4 py-2 text-xs">
                        <Badge size="sm" variant="flat" color="secondary" className="font-mono flex-shrink-0">
                          {(evt.event_type || '').replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                          {evt.event_details?.target?.table || evt.event_details?.table || evt.event_details?.schema || JSON.stringify(evt.event_details || {}).slice(0, 80)}
                        </span>
                        <span className="text-gray-400 flex-shrink-0">{evt.username}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                  DDL Actions ({ddlActions.length})
                </span>
              </div>
              {ddlActions.length === 0 ? (
                <div className="p-4 text-sm text-gray-500 text-center">No DDL actions found</div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {ddlActions.map((action: any, i: number) => {
                    const isExpanded = expandedItems.has(i);
                    return (
                      <div key={action.event_id || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <button
                          onClick={() => toggleExpand(i)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        >
                          <span className="text-xs font-mono text-gray-400 w-5">{i + 1}</span>
                          {isExpanded
                            ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                            : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
                          <Badge size="sm" variant="flat" color="secondary" className="font-mono">
                            {action.ddl_type || 'DDL'}
                          </Badge>
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                            {action.target_table || action.description || `Action ${i + 1}`}
                          </span>
                          <Badge size="sm" variant="flat"
                            color={action.status === 'pending' ? 'warning' : action.status === 'executed' ? 'success' : 'secondary'}
                          >
                            {action.status}
                          </Badge>
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-3 pl-16">
                            {action.description && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{action.description}</p>
                            )}
                            <pre className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 overflow-x-auto max-h-48 whitespace-pre-wrap font-mono">
                              {action.ddl_sql || 'No SQL available'}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
