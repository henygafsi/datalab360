'use client';

import React from 'react';
import { FormField, Input } from './_shared';

/**
 * GitFileConfigForm — handles block type(s): `git_file`.
 *
 * Lazy-loaded by `ETLConfigSidebar.tsx` via `next/dynamic`. Do not import
 * directly from app code — go through the sidebar's dynamic registry so the
 * code-split boundary is preserved.
 */

const GitFileConfigForm: React.FC<{
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
      <FormField label="Repository Name" required error={errors.repo_name}>
        <Input
          value={config.repo_name || ''}
          onChange={(v) => updateConfig({ repo_name: v })}
          placeholder="e.g., my-data-repo"
          error={!!errors.repo_name}
        />
      </FormField>

      <FormField label="File Path" required error={errors.file_path}>
        <Input
          value={config.file_path || ''}
          onChange={(v) => updateConfig({ file_path: v })}
          placeholder="e.g., scripts/transform.sql"
          error={!!errors.file_path}
        />
      </FormField>

      <FormField label="Branch" hint="Git branch to use (defaults to main)">
        <Input
          value={config.branch || 'main'}
          onChange={(v) => updateConfig({ branch: v })}
          placeholder="main"
        />
      </FormField>
    </div>
  );
};

export default GitFileConfigForm;
