'use client';

import { Select } from 'rizzui';
import { Database } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface DataSourceSectionProps {
  database: string;
  schema: string;
  table: string;
  dbOptions: SelectOption[];
  schemaOptions: SelectOption[];
  tableOptions: SelectOption[];
  onDatabaseChange: (db: string) => void;
  onSchemaChange: (schema: string) => void;
  onTableChange: (table: string) => void;
}

export default function DataSourceSection({
  database,
  schema,
  table,
  dbOptions,
  schemaOptions,
  tableOptions,
  onDatabaseChange,
  onSchemaChange,
  onTableChange,
}: DataSourceSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
        <Database className="h-4 w-4" />
        Data Source
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Select
          label="Database"
          options={dbOptions}
          value={database}
          onChange={(opt: any) => onDatabaseChange(opt?.value || '')}
          placeholder="Select..."
        />
        <Select
          label="Schema"
          options={schemaOptions}
          value={schema}
          onChange={(opt: any) => onSchemaChange(opt?.value || '')}
          placeholder="Select..."
          disabled={!database}
        />
        <Select
          label="Table"
          options={tableOptions}
          value={table}
          onChange={(opt: any) => onTableChange(opt?.value || '')}
          placeholder="Select..."
          disabled={!schema}
        />
      </div>
    </div>
  );
}
