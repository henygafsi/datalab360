'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip, Modal, Avatar, Text } from 'rizzui';
import {
  Check, X, Clock, AlertTriangle, MessageSquare, ChevronDown, ChevronRight,
  User, Calendar, FileText, Shield, Database, Rocket, Eye, History,
  CircleAlert, CircleCheck, CircleX, Bell, RefreshCw, Send, Filter
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentStore, ApprovalRequest } from '../stores/deployment-store';
import { formatDistanceToNow } from 'date-fns';

// Priority colors and labels
const priorityConfig = {
  critical: { color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: CircleAlert, label: 'Critical' },
  high: { color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: CircleAlert, label: 'High' },
  medium: { color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', icon: Clock, label: 'Medium' },
  low: { color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400', icon: Clock, label: 'Low' },
};

// Status colors
const statusConfig = {
  pending: { color: 'bg-amber-500', label: 'Pending' },
  approved: { color: 'bg-green-500', label: 'Approved' },
  rejected: { color: 'bg-red-500', label: 'Rejected' },
  expired: { color: 'bg-slate-500', label: 'Expired' },
};

interface ApprovalPanelProps {
  className?: string;
  compact?: boolean;
  maxItems?: number;
  onViewDetails?: (request: ApprovalRequest) => void;
}

const ApprovalPanel: React.FC<ApprovalPanelProps> = ({
  className,
  compact = false,
  maxItems = 5,
  onViewDetails,
}) => {
  const { approvalRequests, pendingApprovals, approveDeployment, rejectDeployment } = useDeploymentStore();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [comment, setComment] = useState('');
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');

  // Filter requests
  const filteredRequests = useMemo(() => {
    let requests = approvalRequests;
    if (filter === 'pending') {
      requests = pendingApprovals;
    } else if (filter !== 'all') {
      requests = approvalRequests.filter((r) => r.status === filter);
    }
    return requests.slice(0, maxItems);
  }, [approvalRequests, pendingApprovals, filter, maxItems]);

  // Handle approve action
  const handleApprove = useCallback((request: ApprovalRequest) => {
    setSelectedRequest(request);
    setActionType('approve');
    setShowCommentModal(true);
  }, []);

  // Handle reject action
  const handleReject = useCallback((request: ApprovalRequest) => {
    setSelectedRequest(request);
    setActionType('reject');
    setShowCommentModal(true);
  }, []);

  // Submit action
  const handleSubmitAction = useCallback(() => {
    if (!selectedRequest) return;

    const currentUserId = 'current_user'; // Would come from auth context

    if (actionType === 'approve') {
      approveDeployment({
        approval_id: selectedRequest.approval_request_id,
        user_id: currentUserId,
        comment: comment || undefined,
      });
      toast.success('Deployment approved successfully');
    } else {
      if (!comment.trim()) {
        toast.error('Please provide a reason for rejection');
        return;
      }
      rejectDeployment({
        approval_id: selectedRequest.approval_request_id,
        user_id: currentUserId,
        comment,
      });
      toast.success('Deployment rejected');
    }

    setShowCommentModal(false);
    setComment('');
    setSelectedRequest(null);
  }, [selectedRequest, actionType, comment, approveDeployment, rejectDeployment]);

  // Toggle expand
  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Calculate time remaining
  const getTimeRemaining = (deadline?: string) => {
    if (!deadline) return null;
    const deadlineDate = new Date(deadline);
    const now = new Date();
    if (deadlineDate < now) return 'Expired';
    return formatDistanceToNow(deadlineDate, { addSuffix: true });
  };

  if (compact) {
    // Compact view for dashboard widgets
    return (
      <div className={cn('rounded-lg border dark:border-slate-700', className)}>
        <div className="px-4 py-3 border-b dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <h3 className="font-semibold">Pending Approvals</h3>
          </div>
          <Badge className="bg-blue-100 text-blue-700">{pendingApprovals.length}</Badge>
        </div>

        {pendingApprovals.length === 0 ? (
          <div className="p-6 text-center text-slate-500">
            <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p className="text-sm">No pending approvals</p>
          </div>
        ) : (
          <div className="divide-y dark:divide-slate-700">
            {pendingApprovals.slice(0, 3).map((request) => {
              const priority = priorityConfig[request.priority];

              return (
                <div key={request.approval_request_id} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge size="sm" className={priority.color}>
                          {priority.label}
                        </Badge>
                        <span className="text-sm font-medium truncate">
                          v{request.version}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {request.changes_summary.total_events} changes
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Tooltip content="Approve">
                        <button
                          className="p-1.5 rounded-full hover:bg-green-100 text-slate-400 hover:text-green-600"
                          onClick={() => handleApprove(request)}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </Tooltip>
                      <Tooltip content="Reject">
                        <button
                          className="p-1.5 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-600"
                          onClick={() => handleReject(request)}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                </div>
              );
            })}

            {pendingApprovals.length > 3 && (
              <div className="p-3 text-center">
                <Button variant="text" size="sm">
                  View all {pendingApprovals.length} approvals
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Comment Modal */}
        <Modal isOpen={showCommentModal} onClose={() => setShowCommentModal(false)}>
          <div className="p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              {actionType === 'approve' ? (
                <>
                  <CircleCheck className="h-5 w-5 text-green-500" />
                  Approve Deployment
                </>
              ) : (
                <>
                  <CircleX className="h-5 w-5 text-red-500" />
                  Reject Deployment
                </>
              )}
            </h3>

            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <p className="text-sm font-medium">v{selectedRequest?.version}</p>
              <p className="text-xs text-slate-500">
                {selectedRequest?.changes_summary.total_events} changes
              </p>
            </div>

            <div className="mb-4">
              <label className="text-sm font-medium">
                {actionType === 'approve' ? 'Comment (optional)' : 'Reason for rejection *'}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={actionType === 'approve' ? 'Add a comment...' : 'Please explain why this deployment is being rejected...'}
                className="w-full mt-2 p-3 border dark:border-slate-700 rounded-lg min-h-[100px] dark:bg-slate-800"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowCommentModal(false)}>
                Cancel
              </Button>
              <Button
                className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                onClick={handleSubmitAction}
              >
                {actionType === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // Full view
  return (
    <div className={cn('rounded-lg border dark:border-slate-700 bg-white dark:bg-slate-900', className)}>
      {/* Header */}
      <div className="px-6 py-4 border-b dark:border-slate-700 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-bold">Approval Queue</h2>
              <p className="text-sm text-blue-100">
                Review and approve deployment requests
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" className="text-white border-white/30 hover:bg-white/10">
              <Bell className="h-4 w-4 mr-1" />
              Notifications
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-3 border-b dark:border-slate-700 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-sm text-slate-500">Filter:</span>
        </div>
        <div className="flex gap-1">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              className={cn(
                'px-3 py-1 text-sm rounded-full transition-colors',
                filter === f
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && pendingApprovals.length > 0 && (
                <Badge size="sm" className="ml-1 bg-amber-500 text-white">{pendingApprovals.length}</Badge>
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {filteredRequests.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
              <Shield className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-slate-500">No approval requests to show</p>
          </div>
        ) : (
          filteredRequests.map((request) => {
            const priority = priorityConfig[request.priority];
            const status = statusConfig[request.status];
            const isExpanded = expandedId === request.approval_request_id;
            const timeRemaining = getTimeRemaining(request.deadline);

            return (
              <div
                key={request.approval_request_id}
                className={cn(
                  'border dark:border-slate-700 rounded-lg overflow-hidden',
                  request.priority === 'critical' && 'border-l-4 border-l-red-500',
                  request.priority === 'high' && 'border-l-4 border-l-amber-500'
                )}
              >
                {/* Request Header */}
                <div
                  className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                  onClick={() => toggleExpand(request.approval_request_id)}
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

                      <Badge className={priority.color}>
                        <priority.icon className="h-3 w-3 mr-1" />
                        {priority.label}
                      </Badge>

                      <div>
                        <h4 className="font-medium">Deployment v{request.version}</h4>
                        <p className="text-xs text-slate-500">
                          Requested by {request.requested_by} • {formatDistanceToNow(new Date(request.requested_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {timeRemaining && request.status === 'pending' && (
                        <Badge className={timeRemaining === 'Expired' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-600'}>
                          <Clock className="h-3 w-3 mr-1" />
                          {timeRemaining}
                        </Badge>
                      )}

                      <Badge className={cn('text-white', status.color)}>
                        {status.label}
                      </Badge>

                      {request.status === 'pending' && (
                        <div className="flex items-center gap-1">
                          <Tooltip content="Approve">
                            <button
                              className="p-2 rounded-lg hover:bg-green-100 text-slate-400 hover:text-green-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApprove(request);
                              }}
                            >
                              <Check className="h-5 w-5" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Reject">
                            <button
                              className="p-2 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReject(request);
                              }}
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-4 space-y-4">
                    {/* Changes Summary */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-center">
                        <p className="text-2xl font-bold">{request.changes_summary.total_events}</p>
                        <p className="text-xs text-slate-500">Total Changes</p>
                      </div>
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                        <p className="text-2xl font-bold text-blue-600">{request.changes_summary.by_category.schema || 0}</p>
                        <p className="text-xs text-slate-500">Schema</p>
                      </div>
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-600">{request.changes_summary.by_category.policy || 0}</p>
                        <p className="text-xs text-slate-500">Policy</p>
                      </div>
                      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg text-center">
                        <p className="text-2xl font-bold text-purple-600">{request.changes_summary.by_category.ingestion || 0}</p>
                        <p className="text-xs text-slate-500">Ingestion</p>
                      </div>
                    </div>

                    {/* High Risk Warning */}
                    {request.changes_summary.high_risk_changes > 0 && (
                      <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <div>
                          <p className="font-medium text-amber-700 dark:text-amber-400">
                            {request.changes_summary.high_risk_changes} High Risk Changes
                          </p>
                          <p className="text-sm text-amber-600 dark:text-amber-500">
                            Review carefully before approving
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Approvers Status */}
                    <div>
                      <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Approvers
                      </h5>
                      <div className="space-y-2">
                        {request.approvers.map((approver, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar size="sm" name={approver.user_id} />
                              <div>
                                <p className="text-sm font-medium">{approver.user_id}</p>
                                <p className="text-xs text-slate-500">{approver.role}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {approver.required && (
                                <Badge size="sm" className="bg-amber-100 text-amber-700">Required</Badge>
                              )}
                              {approver.status === 'pending' && (
                                <Badge size="sm" className="bg-slate-100 text-slate-600">Pending</Badge>
                              )}
                              {approver.status === 'approved' && (
                                <Badge size="sm" className="bg-green-100 text-green-600">
                                  <Check className="h-3 w-3 mr-1" />
                                  Approved
                                </Badge>
                              )}
                              {approver.status === 'rejected' && (
                                <Badge size="sm" className="bg-red-100 text-red-600">
                                  <X className="h-3 w-3 mr-1" />
                                  Rejected
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Comments */}
                    {request.comments.length > 0 && (
                      <div>
                        <h5 className="text-sm font-medium mb-2 flex items-center gap-2">
                          <MessageSquare className="h-4 w-4" />
                          Comments ({request.comments.length})
                        </h5>
                        <div className="space-y-2">
                          {request.comments.map((c, idx) => (
                            <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                              <div className="flex items-center gap-2 mb-1">
                                <Avatar size="sm" name={c.user_id} />
                                <span className="text-sm font-medium">{c.user_id}</span>
                                <span className="text-xs text-slate-400">
                                  {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300 ml-8">{c.comment}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-4 border-t dark:border-slate-700">
                      <Button variant="outline" size="sm" onClick={() => onViewDetails?.(request)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Button>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Add Comment
                        </Button>
                        {request.status === 'pending' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleReject(request)}
                            >
                              <X className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => handleApprove(request)}
                            >
                              <Check className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Comment Modal */}
      <Modal isOpen={showCommentModal} onClose={() => setShowCommentModal(false)}>
        <div className="p-6 max-w-md">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            {actionType === 'approve' ? (
              <>
                <CircleCheck className="h-5 w-5 text-green-500" />
                Approve Deployment
              </>
            ) : (
              <>
                <CircleX className="h-5 w-5 text-red-500" />
                Reject Deployment
              </>
            )}
          </h3>

          {selectedRequest && (
            <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Badge className={priorityConfig[selectedRequest.priority].color}>
                  {priorityConfig[selectedRequest.priority].label}
                </Badge>
                <span className="font-medium">v{selectedRequest.version}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-slate-500">
                <div>{selectedRequest.changes_summary.total_events} changes</div>
                <div>{selectedRequest.changes_summary.affected_tables} tables</div>
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="text-sm font-medium">
              {actionType === 'approve' ? 'Comment (optional)' : 'Reason for rejection *'}
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                actionType === 'approve'
                  ? 'Add a comment about this approval...'
                  : 'Please explain why this deployment is being rejected...'
              }
              className="w-full mt-2 p-3 border dark:border-slate-700 rounded-lg min-h-[100px] dark:bg-slate-800 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCommentModal(false)}>
              Cancel
            </Button>
            <Button
              className={actionType === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
              onClick={handleSubmitAction}
            >
              <Send className="h-4 w-4 mr-1" />
              {actionType === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ApprovalPanel;
