'use client';

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip, Switch } from 'rizzui';
import {
  Plus, Trash2, Clock, Calendar, Database, User, Code2, Link2,
  ChevronDown, ChevronRight, AlertTriangle, Check, HelpCircle,
  Workflow, ToggleLeft, Server, Zap
} from 'lucide-react';

// Condition Types
export type ConditionType =
  | 'time_based'
  | 'dependency'
  | 'data_availability'
  | 'approval'
  | 'resource'
  | 'custom_sql'
  | 'external_api';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'matches_regex'
  | 'is_null'
  | 'is_not_null';

export interface Condition {
  id: string;
  type: ConditionType;
  operator?: ConditionOperator;
  config: Record<string, any>;
  required: boolean;
  enabled: boolean;
}

// Condition type metadata
const conditionTypes: Record<ConditionType, {
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
}> = {
  time_based: {
    label: 'Time Window',
    icon: Clock,
    description: 'Execute during specific time periods',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  dependency: {
    label: 'Dependency',
    icon: Link2,
    description: 'Wait for other events/tasks to complete',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  data_availability: {
    label: 'Data Available',
    icon: Database,
    description: 'Check for data in streams or tables',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  approval: {
    label: 'Approval Required',
    icon: User,
    description: 'Require manual approval before execution',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  },
  resource: {
    label: 'Resource Available',
    icon: Server,
    description: 'Check warehouse or compute availability',
    color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
  custom_sql: {
    label: 'Custom SQL',
    icon: Code2,
    description: 'Execute custom SQL to check condition',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  external_api: {
    label: 'External API',
    icon: Zap,
    description: 'Call external endpoint to verify',
    color: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  },
};

interface ConditionBuilderProps {
  conditions: Condition[];
  onChange: (conditions: Condition[]) => void;
  className?: string;
  compact?: boolean;
}

const ConditionBuilder: React.FC<ConditionBuilderProps> = ({
  conditions,
  onChange,
  className,
  compact = false,
}) => {
  const [expandedConditions, setExpandedConditions] = useState<Set<string>>(new Set());
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Generate unique ID
  const generateId = () => `cond_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Add condition
  const addCondition = useCallback((type: ConditionType) => {
    const defaultConfigs: Record<ConditionType, Record<string, any>> = {
      time_based: {
        start_time: '02:00',
        end_time: '06:00',
        timezone: 'UTC',
        days_of_week: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
      },
      dependency: {
        event_ids: [],
        required_status: 'completed',
      },
      data_availability: {
        stream_name: '',
        min_rows: 1,
      },
      approval: {
        approvers: [],
        min_approvals: 1,
        timeout_hours: 24,
      },
      resource: {
        warehouse_name: '',
        required_size: 'SMALL',
      },
      custom_sql: {
        sql: '',
        expected_result: true,
      },
      external_api: {
        endpoint: '',
        method: 'GET',
        expected_status: 200,
      },
    };

    const newCondition: Condition = {
      id: generateId(),
      type,
      config: defaultConfigs[type],
      required: true,
      enabled: true,
    };

    onChange([...conditions, newCondition]);
    setExpandedConditions((prev) => new Set([...Array.from(prev), newCondition.id]));
    setShowAddMenu(false);
  }, [conditions, onChange]);

  // Remove condition
  const removeCondition = useCallback((id: string) => {
    onChange(conditions.filter((c) => c.id !== id));
  }, [conditions, onChange]);

  // Update condition
  const updateCondition = useCallback((id: string, updates: Partial<Condition>) => {
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...updates } : c)));
  }, [conditions, onChange]);

  // Update condition config
  const updateConfig = useCallback((id: string, key: string, value: any) => {
    onChange(conditions.map((c) =>
      c.id === id ? { ...c, config: { ...c.config, [key]: value } } : c
    ));
  }, [conditions, onChange]);

  // Toggle expand
  const toggleExpand = useCallback((id: string) => {
    setExpandedConditions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Render condition config editor
  const renderConfigEditor = (condition: Condition) => {
    const { type, config } = condition;

    switch (type) {
      case 'time_based':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Start Time</label>
                <Input
                  type="time"
                  value={config.start_time}
                  onChange={(e) => updateConfig(condition.id, 'start_time', e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">End Time</label>
                <Input
                  type="time"
                  value={config.end_time}
                  onChange={(e) => updateConfig(condition.id, 'end_time', e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500">Timezone</label>
              <select
                value={config.timezone}
                onChange={(e) => updateConfig(condition.id, 'timezone', e.target.value)}
                className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern (US)</option>
                <option value="America/Chicago">Central (US)</option>
                <option value="America/Denver">Mountain (US)</option>
                <option value="America/Los_Angeles">Pacific (US)</option>
                <option value="Europe/London">London</option>
                <option value="Europe/Paris">Paris</option>
                <option value="Asia/Tokyo">Tokyo</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-2">Days of Week</label>
              <div className="flex flex-wrap gap-1">
                {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
                  <button
                    key={day}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      config.days_of_week?.includes(day)
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600'
                    )}
                    onClick={() => {
                      const days = config.days_of_week || [];
                      const newDays = days.includes(day)
                        ? days.filter((d: string) => d !== day)
                        : [...days, day];
                      updateConfig(condition.id, 'days_of_week', newDays);
                    }}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 'dependency':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Depends on Events (comma-separated)</label>
              <Input
                value={(config.event_ids || []).join(', ')}
                onChange={(e) => updateConfig(
                  condition.id,
                  'event_ids',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )}
                placeholder="evt_001, evt_002"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Required Status</label>
              <select
                value={config.required_status}
                onChange={(e) => updateConfig(condition.id, 'required_status', e.target.value)}
                className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="completed">Completed</option>
                <option value="validated">Validated</option>
                <option value="approved">Approved</option>
              </select>
            </div>
          </div>
        );

      case 'data_availability':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Stream/Table Name</label>
              <Input
                value={config.stream_name}
                onChange={(e) => updateConfig(condition.id, 'stream_name', e.target.value)}
                placeholder="CUSTOMER_STREAM"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Minimum Rows</label>
              <Input
                type="number"
                value={config.min_rows}
                onChange={(e) => updateConfig(condition.id, 'min_rows', parseInt(e.target.value) || 1)}
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'approval':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Approvers (comma-separated)</label>
              <Input
                value={(config.approvers || []).join(', ')}
                onChange={(e) => updateConfig(
                  condition.id,
                  'approvers',
                  e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                )}
                placeholder="role:DATA_MODELER, user:admin@company.com"
                className="mt-1"
              />
              <p className="text-xs text-slate-400 mt-1">
                Use role: or user: prefix
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Min Approvals</label>
                <Input
                  type="number"
                  value={config.min_approvals}
                  onChange={(e) => updateConfig(condition.id, 'min_approvals', parseInt(e.target.value) || 1)}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">Timeout (hours)</label>
                <Input
                  type="number"
                  value={config.timeout_hours}
                  onChange={(e) => updateConfig(condition.id, 'timeout_hours', parseInt(e.target.value) || 24)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        );

      case 'resource':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Warehouse Name</label>
              <Input
                value={config.warehouse_name}
                onChange={(e) => updateConfig(condition.id, 'warehouse_name', e.target.value)}
                placeholder="COMPUTE_WH"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Required Size</label>
              <select
                value={config.required_size}
                onChange={(e) => updateConfig(condition.id, 'required_size', e.target.value)}
                className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="XSMALL">X-Small</option>
                <option value="SMALL">Small</option>
                <option value="MEDIUM">Medium</option>
                <option value="LARGE">Large</option>
                <option value="XLARGE">X-Large</option>
              </select>
            </div>
          </div>
        );

      case 'custom_sql':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">SQL Query</label>
              <textarea
                value={config.sql}
                onChange={(e) => updateConfig(condition.id, 'sql', e.target.value)}
                placeholder="SELECT COUNT(*) = 0 FROM ..."
                className="w-full mt-1 p-3 font-mono text-sm bg-slate-900 text-green-400 rounded-lg min-h-[80px]"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-500">Expected Result:</label>
              <select
                value={String(config.expected_result)}
                onChange={(e) => updateConfig(condition.id, 'expected_result', e.target.value === 'true')}
                className="flex-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
              >
                <option value="true">TRUE / Non-zero</option>
                <option value="false">FALSE / Zero</option>
              </select>
            </div>
          </div>
        );

      case 'external_api':
        return (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-500">Endpoint URL</label>
              <Input
                value={config.endpoint}
                onChange={(e) => updateConfig(condition.id, 'endpoint', e.target.value)}
                placeholder="https://api.example.com/check"
                className="mt-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">Method</label>
                <select
                  value={config.method}
                  onChange={(e) => updateConfig(condition.id, 'method', e.target.value)}
                  className="w-full mt-1 p-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="HEAD">HEAD</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Expected Status</label>
                <Input
                  type="number"
                  value={config.expected_status}
                  onChange={(e) => updateConfig(condition.id, 'expected_status', parseInt(e.target.value) || 200)}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn('rounded-lg border dark:border-slate-700', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold">Execution Conditions</h3>
          {conditions.length > 0 && (
            <Badge size="sm">{conditions.length}</Badge>
          )}
        </div>

        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Condition
          </Button>

          {showAddMenu && (
            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-lg shadow-xl border dark:border-slate-700 py-2 z-50">
              {Object.entries(conditionTypes).map(([type, meta]) => (
                <button
                  key={type}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 text-left"
                  onClick={() => addCondition(type as ConditionType)}
                >
                  <meta.icon className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-sm font-medium">{meta.label}</p>
                    <p className="text-xs text-slate-500">{meta.description}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {conditions.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <Workflow className="h-10 w-10 mx-auto mb-3 text-slate-300" />
            <p className="font-medium">No conditions defined</p>
            <p className="text-sm mt-1">Add conditions to control when this action executes</p>
          </div>
        ) : (
          <div className="space-y-3">
            {conditions.map((condition, idx) => {
              const meta = conditionTypes[condition.type];
              const isExpanded = expandedConditions.has(condition.id);

              return (
                <div
                  key={condition.id}
                  className={cn(
                    'border dark:border-slate-700 rounded-lg overflow-hidden',
                    !condition.enabled && 'opacity-50'
                  )}
                >
                  {/* Condition Header */}
                  <div
                    className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => toggleExpand(condition.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <button className="p-0.5">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          )}
                        </button>

                        <Badge size="sm" className={meta.color}>
                          <meta.icon className="h-3 w-3 mr-1" />
                          {meta.label}
                        </Badge>

                        {condition.required && (
                          <Badge size="sm" className="bg-red-100 text-red-600">Required</Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Tooltip content={condition.enabled ? 'Disable' : 'Enable'}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updateCondition(condition.id, { enabled: !condition.enabled });
                            }}
                          >
                            <ToggleLeft
                              className={cn(
                                'h-5 w-5',
                                condition.enabled ? 'text-green-500' : 'text-slate-400'
                              )}
                            />
                          </button>
                        </Tooltip>
                        <Tooltip content="Remove">
                          <button
                            className="text-slate-400 hover:text-red-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeCondition(condition.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Config */}
                  {isExpanded && (
                    <div className="p-4 space-y-4">
                      {renderConfigEditor(condition)}

                      <div className="flex items-center justify-between pt-3 border-t dark:border-slate-700">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={condition.required}
                            onChange={(e) => updateCondition(condition.id, { required: e.target.checked })}
                            className="rounded"
                          />
                          Required condition
                        </label>

                        <Tooltip content="If required, execution will fail if this condition is not met">
                          <HelpCircle className="h-4 w-4 text-slate-400" />
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Condition Logic Info */}
        {conditions.length > 1 && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-blue-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                  Condition Logic: AND
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-500 mt-0.5">
                  All enabled conditions must be met for execution to proceed.
                  Required conditions must pass; optional conditions are informational.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConditionBuilder;
