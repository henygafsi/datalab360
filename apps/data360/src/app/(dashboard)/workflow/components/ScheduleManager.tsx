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

import * as etlService from '@/app/services/etl';
import type { Schedule, CreateScheduleRequest, UpdateScheduleRequest } from '@/app/services/etl/types';

// ============================================
// TYPES
// ============================================

interface ScheduleManagerProps {
  pipelineId: string | null;
  pipelineName?: string;
  onScheduleChange?: () => void;
  className?: string;
  compact?: boolean;
}

interface ScheduleFormData {
  cron_expression: string;
  timezone: string;
  is_active: boolean;
}

// ============================================
// SCHEDULE FORM COMPONENT
// ============================================

interface ScheduleFormProps {
  schedule?: Schedule | null;
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
  const [formData, setFormData] = useState<ScheduleFormData>({
    cron_expression: schedule?.cron_expression || '0 9 * * *',
    timezone: schedule?.timezone || 'UTC',
    is_active: schedule?.is_active ?? true,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showCustomCron, setShowCustomCron] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (schedule) {
        // Update existing schedule
        const updateRequest: UpdateScheduleRequest = {
          cron_expression: formData.cron_expression,
          timezone: formData.timezone,
          is_active: formData.is_active,
        };
        await etlService.updateSchedule(schedule.schedule_id, updateRequest);
        toast.success('Schedule updated');
      } else {
        // Create new schedule
        const createRequest: CreateScheduleRequest = {
          pipeline_id: pipelineId,
          cron_expression: formData.cron_expression,
          timezone: formData.timezone,
          is_active: formData.is_active,
        };
        await etlService.createSchedule(createRequest);
        toast.success('Schedule created');
      }
      onSave();
    } catch (error: any) {
      console.error('Failed to save schedule:', error);
      toast.error(error.response?.data?.detail || 'Failed to save schedule');
    } finally {
      setIsSaving(false);
    }
  };

  const isPreset = etlService.CRON_PRESETS.some((p) => p.value === formData.cron_expression);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Cron Expression */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Schedule Frequency
        </label>

        {/* Preset Options */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          {etlService.CRON_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                setFormData((prev) => ({ ...prev, cron_expression: preset.value }));
                setShowCustomCron(false);
              }}
              className={cn(
                'px-3 py-2 text-sm rounded-lg border transition',
                formData.cron_expression === preset.value
                  ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom Cron */}
        <button
          type="button"
          onClick={() => setShowCustomCron(!showCustomCron)}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-lg border transition flex items-center justify-between',
            showCustomCron || !isPreset
              ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/30 dark:border-blue-400 dark:text-blue-300'
              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
          )}
        >
          <span>Custom Cron Expression</span>
          <ChevronDown className={cn('h-4 w-4 transition', showCustomCron && 'rotate-180')} />
        </button>

        {showCustomCron && (
          <div className="mt-2">
            <input
              type="text"
              value={formData.cron_expression}
              onChange={(e) => setFormData((prev) => ({ ...prev, cron_expression: e.target.value }))}
              placeholder="0 9 * * *"
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">
              Format: minute hour day-of-month month day-of-week
            </p>
          </div>
        )}

        {/* Display parsed cron */}
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {etlService.cronToHuman(formData.cron_expression)}
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
          {etlService.TIMEZONES.map((tz) => (
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
  scheduleId: string;
  onClose: () => void;
}

const ScheduleHistory: React.FC<ScheduleHistoryProps> = ({ scheduleId, onClose }) => {
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        const response = await etlService.getScheduleHistory(scheduleId);
        setHistory(response.history || []);
      } catch (error) {
        console.error('Failed to load schedule history:', error);
        setHistory([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadHistory();
  }, [scheduleId]);

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
                  etlService.getStatusColor(entry.status)
                )}
              >
                {entry.status}
              </span>
              <span className="text-xs text-slate-500">
                {new Date(entry.started_at).toLocaleString()}
              </span>
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
              <div>Duration: {entry.duration_seconds ? etlService.formatDuration(entry.duration_seconds) : '-'}</div>
              <div>Rows: {entry.rows_processed?.toLocaleString() || '-'}</div>
              {entry.error_message && (
                <div className="text-red-500 mt-1">{entry.error_message}</div>
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
}) => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [viewingHistory, setViewingHistory] = useState<string | null>(null);

  // Load schedules
  const loadSchedules = useCallback(async () => {
    if (!pipelineId) {
      setSchedules([]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await etlService.listSchedules();
      // Filter to only this pipeline's schedules
      const pipelineSchedules = response.schedules.filter(
        (s) => s.pipeline_id === pipelineId
      );
      setSchedules(pipelineSchedules);
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
  const handleSuspend = async (schedule: Schedule) => {
    try {
      await etlService.suspendSchedule(schedule.schedule_id);
      toast.success('Schedule suspended');
      loadSchedules();
      onScheduleChange?.();
    } catch (error: any) {
      console.error('Failed to suspend schedule:', error);
      toast.error(error.response?.data?.detail || 'Failed to suspend schedule');
    }
  };

  const handleResume = async (schedule: Schedule) => {
    try {
      await etlService.resumeSchedule(schedule.schedule_id);
      toast.success('Schedule resumed');
      loadSchedules();
      onScheduleChange?.();
    } catch (error: any) {
      console.error('Failed to resume schedule:', error);
      toast.error(error.response?.data?.detail || 'Failed to resume schedule');
    }
  };

  const handleDelete = async (schedule: Schedule) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      await etlService.deleteSchedule(schedule.schedule_id);
      toast.success('Schedule deleted');
      loadSchedules();
      onScheduleChange?.();
    } catch (error: any) {
      console.error('Failed to delete schedule:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete schedule');
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
  if (viewingHistory) {
    return (
      <div className={cn('p-4', className)}>
        <ScheduleHistory
          scheduleId={viewingHistory}
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
        <button
          onClick={() => setShowForm(true)}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus className="h-4 w-4" />
          {compact ? '' : 'Add'}
        </button>
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
          schedules.map((schedule) => (
            <div
              key={schedule.schedule_id}
              className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600"
            >
              {/* Status & Cron */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'px-2 py-1 rounded text-xs font-medium',
                      schedule.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-600 dark:text-slate-300'
                    )}
                  >
                    {schedule.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {/* Toggle active/paused */}
                  <button
                    onClick={() =>
                      schedule.is_active ? handleSuspend(schedule) : handleResume(schedule)
                    }
                    className={cn(
                      'p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600',
                      schedule.is_active ? 'text-orange-500' : 'text-green-500'
                    )}
                    title={schedule.is_active ? 'Pause' : 'Resume'}
                  >
                    {schedule.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>

                  {/* Edit */}
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

                  {/* History */}
                  <button
                    onClick={() => setViewingHistory(schedule.schedule_id)}
                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500"
                    title="View History"
                  >
                    <History className="h-4 w-4" />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(schedule)}
                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600 text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Schedule details */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span className="font-medium">{etlService.cronToHuman(schedule.cron_expression)}</span>
                </div>

                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                  <Globe className="h-4 w-4" />
                  <span>{schedule.timezone}</span>
                </div>

                {schedule.next_run_at && (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <Calendar className="h-4 w-4" />
                    <span>Next: {new Date(schedule.next_run_at).toLocaleString()}</span>
                  </div>
                )}

                {schedule.last_run_at && (
                  <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                    <History className="h-4 w-4" />
                    <span>Last: {new Date(schedule.last_run_at).toLocaleString()}</span>
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
          ))
        )}
      </div>
    </div>
  );
};

export default ScheduleManager;
