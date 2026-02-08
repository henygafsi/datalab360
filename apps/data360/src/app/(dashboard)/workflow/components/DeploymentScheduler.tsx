'use client';

import React, { useState } from 'react';
import {
  Rocket,
  Calendar,
  Clock,
  Shield,
  AlertCircle,
  Loader2,
  Check,
  X,
  ChevronDown,
  Users,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from 'next-auth/react';
import { scheduleDeployment, DeploymentStatus, WorkflowStep } from '@/app/services/workflow';
import { addLocalDeployment } from './DeploymentHistory';

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

interface DeploymentSchedulerProps {
  workflowId: string;
  workflowName: string;
  steps: WorkflowStep[];
  isOpen: boolean;
  onClose: () => void;
  onDeploymentCreated?: (eventId: string, status: DeploymentStatus) => void;
}

type DeploymentType = 'immediate' | 'scheduled' | 'approval';

const DeploymentScheduler: React.FC<DeploymentSchedulerProps> = ({
  workflowId,
  workflowName,
  steps,
  isOpen,
  onClose,
  onDeploymentCreated,
}) => {
  const { data: session } = useSession();
  const [deploymentType, setDeploymentType] = useState<DeploymentType>('approval');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('08:00');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const currentUser = (session?.user as any)?.name || (session?.user as any)?.email || 'system';

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      let scheduledDateTime: string | undefined;
      if (deploymentType === 'scheduled' && scheduledDate) {
        scheduledDateTime = `${scheduledDate}T${scheduledTime}:00Z`;
      }

      const isImmediate = deploymentType === 'immediate';

      const result = await scheduleDeployment({
        workflow_id: workflowId,
        workflow_name: workflowName,
        steps: steps,
        scheduled_date: scheduledDateTime,
        requires_approval: deploymentType === 'approval' || deploymentType === 'scheduled',
        immediate: isImmediate,
        created_by: currentUser,
        description: `Workflow deployment: ${workflowName} (${deploymentType})`,
      });

      // Save deployment to localStorage for history tracking
      const deploymentTypeMap = {
        immediate: 'immediate' as const,
        scheduled: 'scheduled' as const,
        approval: 'approval' as const,
      };

      addLocalDeployment({
        event_id: result.event_id,
        workflow_id: workflowId,
        workflow_name: workflowName,
        status: result.status,
        deployment_type: deploymentTypeMap[deploymentType],
        scheduled_date: scheduledDateTime,
        steps: steps,
        created_by: currentUser,
        created_at: new Date().toISOString(),
        executed_at: isImmediate ? new Date().toISOString() : undefined,
        description: `Workflow deployment: ${workflowName} (${deploymentType})`,
      });

      if (isImmediate) {
        setSuccess('Workflow deployed and executed successfully!');
      } else if (deploymentType === 'approval') {
        setSuccess('Deployment submitted for approval!');
      } else {
        setSuccess('Deployment scheduled successfully!');
      }

      onDeploymentCreated?.(result.event_id, result.status);

      // Close after short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Failed to schedule deployment:', err);
      setError(extractErrorMessage(err) || 'Failed to schedule deployment');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const deploymentTypes = [
    {
      id: 'approval' as DeploymentType,
      title: 'Submit for Approval',
      description: 'Submit workflow for review before deployment',
      icon: Shield,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      borderColor: 'border-blue-200 dark:border-blue-800',
    },
    {
      id: 'scheduled' as DeploymentType,
      title: 'Schedule Deployment',
      description: 'Schedule for a specific date and time',
      icon: Calendar,
      color: 'text-purple-500',
      bgColor: 'bg-purple-50 dark:bg-purple-900/20',
      borderColor: 'border-purple-200 dark:border-purple-800',
    },
    {
      id: 'immediate' as DeploymentType,
      title: 'Deploy Now',
      description: 'Deploy immediately without approval',
      icon: Rocket,
      color: 'text-green-500',
      bgColor: 'bg-green-50 dark:bg-green-900/20',
      borderColor: 'border-green-200 dark:border-green-800',
    },
  ];

  // Get minimum date for scheduling (tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-500" />
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Deploy Workflow</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Workflow Info */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <div className="text-sm text-slate-500 dark:text-slate-400">Workflow</div>
            <div className="font-medium text-slate-800 dark:text-slate-200">{workflowName}</div>
          </div>

          {/* Deployment Type Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Deployment Type
            </label>
            <div className="space-y-2">
              {deploymentTypes.map((type) => {
                const Icon = type.icon;
                const isSelected = deploymentType === type.id;
                return (
                  <button
                    key={type.id}
                    onClick={() => setDeploymentType(type.id)}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all',
                      isSelected
                        ? `${type.borderColor} ${type.bgColor}`
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    )}
                  >
                    <div className={cn('p-2 rounded-lg', type.bgColor)}>
                      <Icon className={cn('h-4 w-4', type.color)} />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{type.title}</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">{type.description}</div>
                    </div>
                    {isSelected && (
                      <Check className={cn('h-5 w-5', type.color)} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Scheduled Date/Time (only for scheduled type) */}
          {deploymentType === 'scheduled' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  min={minDate}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Time
                </label>
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-700 dark:text-blue-300">
              {deploymentType === 'approval' && (
                <>
                  This workflow will be submitted for approval. Administrators can approve or reject
                  from the Deployment Dashboard.
                </>
              )}
              {deploymentType === 'scheduled' && (
                <>
                  The workflow will be deployed at the scheduled time after approval.
                  You can view and manage scheduled deployments from the Dashboard.
                </>
              )}
              {deploymentType === 'immediate' && (
                <>
                  <strong>Warning:</strong> The workflow will be deployed immediately without review.
                  This action cannot be undone.
                </>
              )}
            </div>
          </div>

          {/* Approval Flow Info */}
          {(deploymentType === 'approval' || deploymentType === 'scheduled') && (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Users className="h-4 w-4" />
              <span>Approvers: Data Modelers, Data Admins</span>
            </div>
          )}

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                <Check className="h-4 w-4" />
                <span className="text-sm">{success}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting || (deploymentType === 'scheduled' && !scheduledDate)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm text-white rounded-lg transition-colors disabled:opacity-50',
              deploymentType === 'immediate'
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-blue-500 hover:bg-blue-600'
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {deploymentType === 'immediate' ? (
                  <>
                    <Rocket className="h-4 w-4" />
                    Deploy Now
                  </>
                ) : deploymentType === 'scheduled' ? (
                  <>
                    <Calendar className="h-4 w-4" />
                    Schedule
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4" />
                    Submit for Approval
                  </>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeploymentScheduler;
