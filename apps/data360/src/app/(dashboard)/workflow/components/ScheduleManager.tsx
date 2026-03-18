'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  Pause,
  Play,
  Edit2,
  X,
  Loader2,
  History,
  ChevronDown,
  Globe,
} from 'lucide-react';

import * as workflowApi from '@/app/services/api/workflowApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { WorkflowSchedule, WorkflowCronChoice } from '@/app/services/api/types';

// ============================================
// UTILITY CONSTANTS
// ============================================

// Presets map directly to the lowercase cron_choice values expected by the API
const CRON_PRESETS: { value: WorkflowCronChoice; label: string; description: string }[] = [
  { value: 'hourly', label: 'Hourly', description: 'Every hour' },
  { value: 'daily', label: 'Daily', description: 'Daily at midnight' },
  { value: 'weekly', label: 'Weekly', description: 'Weekly on Monday' },
  { value: 'monthly', label: 'Monthly', description: 'Monthly on the 1st' },
];

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Europe/London', label: 'Europe/London (GMT)' },
  { value: 'America/New_York', label: 'America/New_York (EST)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
];

// Human-readable label for a cron_choice
function cronChoiceToHuman(choice: WorkflowCronChoice): string {
  const labels: Record<WorkflowCronChoice, string> = {
    hourly: 'Every hour',
    daily: 'Daily at midnight',
    weekly: 'Weekly on Monday',
    monthly: 'Monthly on the 1st',
  };
  return labels[choice] || choice;
}

// Map a cron expression (from API response) back to human-readable text
function cronToHuman(cron: string): string {
  const patterns: Record<string, string> = {
    '0 * * * *': 'Every hour',
    '0 0 * * *': 'Daily at midnight',
    '0 9 * * *': 'Daily at 9:00 AM',
    '0 0 * * 1': 'Weekly on Monday',
    '0 9 * * 1': 'Weekly on Monday at 9:00 AM',
    '0 0 1 * *': 'Monthly on the 1st',
    '0 9 1 * *': 'Monthly on the 1st at 9:00 AM',
    '0 */2 * * *': 'Every 2 hours',
    '0 9 * * 1-5': 'Weekdays at 9:00 AM',
  };
  return patterns[cron] || cron;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    running: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20',
    completed: 'text-green-500 bg-green-50 dark:bg-green-900/20',
    failed: 'text-red-500 bg-red-50 dark:bg-red-900/20',
    active: 'text-green-500 bg-green-50 dark:bg-green-900/20',
    inactive: 'text-slate-500 bg-slate-50 dark:bg-slate-900/20',
  };
  return colors[status] || 'text-slate-500 bg-slate-50';
}

// Map a cron expression (from API response) back to a preset, or null if custom
function cronExpressionToChoice(cron: string): WorkflowCronChoice | null {
  if (cron === '0 * * * *') return 'hourly';
  if (cron === '0 0 * * *') return 'daily';
  if (cron === '0 0 * * 1') return 'weekly';
  if (cron === '0 0 1 * *') return 'monthly';
  return null; // custom cron
}

// ============================================
// TYPES
// ============================================

interface ScheduleManagerProps {
  pipelineId: string | null;
  pipelineName?: string;
  onScheduleChange?: () => void;
  className?: string;
  compact?: boolean;
  isReadOnly?: boolean;
}

// Form uses either a preset cron_choice OR a custom_cron string (mutually exclusive)
type ScheduleMode = 'preset' | 'custom';

interface ScheduleFormData {
  mode: ScheduleMode;
  cron_choice: WorkflowCronChoice;
  custom_cron: string;
  timezone: string;
  is_active: boolean;
}

// ============================================
// SCHEDULE FORM COMPONENT
// ============================================

interface ScheduleFormProps {
  schedule?: WorkflowSchedule | null;
  pipelineId: string;
  onSave: () => void;
  onCancel: () => void;
}

const ScheduleForm: React.FC<ScheduleFormProps> = ({
  schedule,
  pipelineId,
  onSave,
  onCancel,
}) => {
  // When editing, derive mode from the existing cron_expression
  const existingChoice = schedule ? cronExpressionToChoice(schedule.cron_expression) : null;
  const isExistingCustom = schedule && existingChoice === null;

  const [formData, setFormData] = useState<ScheduleFormData>({
    mode: isExistingCustom ? 'custom' : 'preset',
    cron_choice: existingChoice || 'daily',
    custom_cron: isExistingCustom ? schedule!.cron_expression : '',
    timezone: 'UTC',
    is_active: schedule ? (schedule.state === 'started') : true,
  });
  const [isSaving, setIsSaving] = useState(false);

  const isCustom = formData.mode === 'custom';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate custom cron
    if (isCustom && !formData.custom_cron.trim()) {
      toast.error('Please enter a custom cron expression');
      return;
    }

    setIsSaving(true);

    try {
      if (schedule) {
        // Update existing: resume or suspend the task
        if (formData.is_active) {
          await workflowApi.resumeTask(pipelineId);
        } else {
          await workflowApi.suspendTask(pipelineId);
        }
        toast.success('Schedule updated');
      } else {
        // Create new schedule — API expects:
        // Preset:  { "cron_choice": "hourly" }
        // Custom:  { "custom_cron": "0 * * * *" }
        await workflowApi.scheduleWorkflow(pipelineId, {
          cron_choice: isCustom ? undefined : formData.cron_choice,
          custom_cron: isCustom ? formData.custom_cron.trim() : undefined,
          warehouse: 'COMPUTE_WH',
        });
        toast.success('Schedule created');
      }
      onSave();
    } catch (error: any) {
      console.error('Failed to save schedule:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Schedule Frequency */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Schedule Frequency
        </label>

        {/* Preset Options */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          {CRON_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                setFormData((prev) => ({ ...prev, mode: 'preset', cron_choice: preset.value, custom_cron: '' }));
              }}
              className={cn(
                'px-3 py-2 text-sm rounded-lg border transition text-left',
                !isCustom && formData.cron_choice === preset.value
                  ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              <span className="font-medium">{preset.label}</span>
              <span className="block text-xs opacity-70">{preset.description}</span>
            </button>
          ))}
        </div>

        {/* Custom Cron toggle */}
        <button
          type="button"
          onClick={() => {
            setFormData((prev) => ({
              ...prev,
              mode: isCustom ? 'preset' : 'custom',
            }));
          }}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-lg border transition flex items-center justify-between',
            isCustom
              ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
          )}
        >
          <span>Custom Cron Expression</span>
          <ChevronDown className={cn('h-4 w-4 transition', isCustom && 'rotate-180')} />
        </button>

        {isCustom && (
          <div className="mt-2">
            <input
              type="text"
              value={formData.custom_cron}
              onChange={(e) => setFormData((prev) => ({ ...prev, custom_cron: e.target.value }))}
              placeholder="0 * * * *"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">
              Format: minute hour day-of-month month day-of-week
            </p>
          </div>
        )}

        {/* Display human-readable summary */}
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {isCustom
            ? (formData.custom_cron ? `Custom: ${formData.custom_cron}` : 'Enter a cron expression')
            : cronChoiceToHuman(formData.cron_choice)
          }
        </p>
      </div>

      {/* Timezone */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          <Globe className="h-4 w-4 inline mr-1" />
          Timezone
        </label>
        <select
          value={formData.timezone}
          onChange={(e) => setFormData((prev) => ({ ...prev, timezone: e.target.value }))}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Enable schedule immediately
        </label>
        <button
          type="button"
          onClick={() => setFormData((prev) => ({ ...prev, is_active: !prev.is_active }))}
          className={cn(
            'w-12 h-6 rounded-full transition relative',
            formData.is_active ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
          )}
        >
          <span
            className={cn(
              'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
              formData.is_active ? 'translate-x-7' : 'translate-x-1'
            )}
          />
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="flex-1 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>{schedule ? 'Update' : 'Create'} Schedule</>
          )}
        </button>
      </div>
    </form>
  );
};

// ============================================
// SCHEDULE HISTORY COMPONENT
// ============================================

interface ScheduleHistoryProps {
  workflowId: string;
  onClose: () => void;
}

const ScheduleHistory: React.FC<ScheduleHistoryProps> = ({ workflowId, onClose }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await workflowApi.listRuns(workflowId, { limit: 20 });
        setHistory(Array.isArray(response?.runs) ? response.runs : []);
      } catch (error) {
        console.error('Failed to load schedule history:', error);
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [workflowId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h4 className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <History className="h-4 w-4" />
          Execution History
        </h4>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
          <X className="h-4 w-4" />
        </button>
      </div>

      {history.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-4">No execution history</p>
      ) : (
        history.map((entry) => (
          <div
            key={entry.run_id}
            className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={cn(
                  'px-2 py-0.5 rounded text-xs font-medium',
                  getStatusColor(entry.status)
                )}
              >
                {entry.status}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(entry.started_at).toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div>Duration: {entry.duration_seconds ? formatDuration(entry.duration_seconds) : '-'}</div>
              <div>Steps: {entry.steps_executed || 0}/{entry.steps_total || 0}</div>
              {entry.error_log && (
                <div className="text-red-500 mt-1">{typeof entry.error_log === 'string' ? entry.error_log : JSON.stringify(entry.error_log)}</div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const ScheduleManager: React.FC<ScheduleManagerProps> = ({
  pipelineId,
  pipelineName,
  onScheduleChange,
  className,
  compact = false,
  isReadOnly = false,
}) => {
  const [schedules, setSchedules] = useState<WorkflowSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WorkflowSchedule | null>(null);
  const [viewingHistory, setViewingHistory] = useState<string | null>(null);

  // Load schedules
  const loadSchedules = useCallback(async () => {
    if (!pipelineId) {
      setSchedules([]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await workflowApi.getWorkflowSchedules(pipelineId);
      setSchedules(response.schedules || []);
    } catch (error) {
      console.error('Failed to load schedules:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Handle schedule actions
  const handleSuspend = async (schedule: WorkflowSchedule) => {
    if (!pipelineId) return;
    try {
      await workflowApi.suspendTask(pipelineId);
      toast.success('Schedule suspended');
      loadSchedules();
      onScheduleChange?.();
    } catch (error: any) {
      console.error('Failed to suspend schedule:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to suspend schedule');
    }
  };

  const handleResume = async (schedule: WorkflowSchedule) => {
    if (!pipelineId) return;
    try {
      await workflowApi.resumeTask(pipelineId);
      toast.success('Schedule resumed');
      loadSchedules();
      onScheduleChange?.();
    } catch (error: any) {
      console.error('Failed to resume schedule:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to resume schedule');
    }
  };

  const handleDelete = async (schedule: WorkflowSchedule) => {
    if (!pipelineId) return;
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      await workflowApi.suspendTask(pipelineId);
      toast.success('Schedule deleted');
      loadSchedules();
      onScheduleChange?.();
    } catch (error: any) {
      console.error('Failed to delete schedule:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to delete schedule');
    }
  };

  const handleFormSave = () => {
    setShowForm(false);
    setEditingSchedule(null);
    loadSchedules();
    onScheduleChange?.();
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingSchedule(null);
  };

  // No pipeline selected
  if (!pipelineId) {
    return (
      <div className={cn('p-4', className)}>
        <p className="text-sm text-slate-500 text-center">
          Save a pipeline first to manage schedules
        </p>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // Show form
  if (showForm) {
    return (
      <div className={cn('p-4', className)}>
        <ScheduleForm
          schedule={editingSchedule}
          pipelineId={pipelineId}
          onSave={handleFormSave}
          onCancel={handleFormCancel}
        />
      </div>
    );
  }

  // Show history
  if (viewingHistory && pipelineId) {
    return (
      <div className={cn('p-4', className)}>
        <ScheduleHistory
          workflowId={pipelineId}
          onClose={() => setViewingHistory(null)}
        />
      </div>
    );
  }

  // Main view
  return (
    <div className={cn('', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-sm text-slate-700 dark:text-slate-200">
            Schedules
          </span>
          {schedules.length > 0 && (
            <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-xs">
              {schedules.length}
            </span>
          )}
        </div>
        {!isReadOnly && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            {compact ? '' : 'Add'}
          </button>
        )}
      </div>

      {/* Schedule list */}
      <div className="p-4 space-y-3">
        {schedules.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">No schedules configured</p>
            <p className="text-xs text-slate-400 mt-1">
              Create a schedule to run this pipeline automatically
            </p>
          </div>
        ) : (
          schedules.map((schedule) => {
            const isActive = schedule.state === 'started';
            return (
              <div
                key={schedule.task_name}
                className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600"
              >
                {/* Task name */}
                {schedule.task_name && (
                  <div className="mb-2 text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {schedule.task_name}
                  </div>
                )}

                {/* Status & Actions */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'px-2 py-1 rounded text-xs font-medium',
                        isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                      )}
                    >
                      {schedule.state || (isActive ? 'Active' : 'Suspended')}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Toggle active/paused */}
                    {!isReadOnly && (
                      <button
                        onClick={() =>
                          isActive ? handleSuspend(schedule) : handleResume(schedule)
                        }
                        className={cn(
                          'p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600',
                          isActive ? 'text-orange-500' : 'text-green-500'
                        )}
                        title={isActive ? 'Pause' : 'Resume'}
                      >
                        {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                    )}

                    {/* Edit */}
                    {!isReadOnly && (
                      <button
                        onClick={() => {
                          setEditingSchedule(schedule);
                          setShowForm(true);
                        }}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-blue-500"
                        title="Edit"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    )}

                    {/* History */}
                    <button
                      onClick={() => setViewingHistory(schedule.task_name)}
                      className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500"
                      title="View History"
                    >
                      <History className="h-4 w-4" />
                    </button>

                    {/* Delete */}
                    {!isReadOnly && (
                      <button
                        onClick={() => handleDelete(schedule)}
                        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-red-500"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Schedule details */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span className="font-medium">{schedule.schedule}</span>
                  </div>

                  {schedule.warehouse && (
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Globe className="h-4 w-4" />
                      <span>{schedule.warehouse}</span>
                    </div>
                  )}

                  {schedule.created_at && (
                    <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                      <Calendar className="h-4 w-4" />
                      <span>Created: {new Date(schedule.created_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Cron expression (collapsed) */}
                {!compact && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600">
                    <code className="text-xs text-slate-400 font-mono">
                      {schedule.cron_expression}
                    </code>
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

export default ScheduleManager;
