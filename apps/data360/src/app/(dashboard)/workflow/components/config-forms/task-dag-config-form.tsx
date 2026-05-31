'use client';

import React from 'react';
import { FormField, Input, Textarea } from './_shared';

/**
 * TaskDagConfigForm — handles block type `task_dag`.
 *
 * Defines a Snowflake Task DAG: a root task (warehouse + schedule) plus
 * dependent tasks chained via AFTER. Dependent tasks are entered as a light
 * textarea (one `name | sql | after` per line) and parsed by the compiler.
 */

const TaskDagConfigForm: React.FC<{
  data: any;
  onChange: (data: any) => void;
  errors: Record<string, string>;
}> = ({ data, onChange, errors }) => {
  const config = data.config || data;

  const updateConfig = (updates: Record<string, any>) => {
    onChange({ ...data, config: { ...config, ...updates } });
  };

  return (
    <div className="space-y-4">
      <div className="p-2.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800">
        <p className="text-xs text-sky-700 dark:text-sky-300">
          Orchestrate this pipeline as a Snowflake Task DAG — a root task on a schedule
          plus dependent tasks chained with AFTER.
        </p>
      </div>

      <FormField label="Root Task Name" required error={errors.root_task_name}
        hint="Name for the root task (e.g., DAILY_ROOT)">
        <Input
          value={config.root_task_name || ''}
          onChange={(v) => updateConfig({ root_task_name: v })}
          placeholder="e.g., DAILY_ROOT"
          error={!!errors.root_task_name}
        />
      </FormField>

      <FormField label="Warehouse" required error={errors.warehouse}
        hint="Compute warehouse the tasks run on">
        <Input
          value={config.warehouse || ''}
          onChange={(v) => updateConfig({ warehouse: v })}
          placeholder="e.g., COMPUTE_WH"
          error={!!errors.warehouse}
        />
      </FormField>

      <FormField label="Schedule" error={errors.schedule}
        hint="Optional root schedule, e.g. USING CRON 0 9 * * * UTC  or  60 MINUTE">
        <Input
          value={config.schedule || ''}
          onChange={(v) => updateConfig({ schedule: v })}
          placeholder="e.g., USING CRON 0 9 * * * UTC"
        />
      </FormField>

      <FormField label="Dependent Tasks" error={errors.tasks}
        hint="One per line: NAME | SQL | AFTER_TASK. Leave AFTER empty to chain on the root.">
        <Textarea
          value={config.tasks || ''}
          onChange={(v) => updateConfig({ tasks: v })}
          placeholder={'LOAD_STAGING | INSERT INTO staging … | \nTRANSFORM | MERGE INTO … | LOAD_STAGING'}
          rows={4}
        />
      </FormField>
    </div>
  );
};

export default TaskDagConfigForm;
