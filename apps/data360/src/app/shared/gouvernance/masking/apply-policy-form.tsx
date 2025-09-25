'use client';

import React, { useEffect, useState } from 'react';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { applyMaskingPolicy } from '@/app/services/gouvernance/masking';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';

export default function ApplyPolicyForm({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const [form, setForm] = useState({ database: '', schema: '', table: '', column: '', policy_name: '' });
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { getDatabases().then(d => setDatabases(d || [])).catch(() => setDatabases([])); }, []);
  useEffect(() => { if (!form.database) { setSchemas([]); return; } getSchemas(form.database).then(s => setSchemas(s || [])).catch(() => setSchemas([])); }, [form.database]);
  useEffect(() => { if (!form.database || !form.schema) { setTables([]); return; } getTablesTarget(form.database, form.schema).then(t => setTables(t || [])).catch(() => setTables([])); }, [form.database, form.schema]);
  useEffect(() => { if (!form.database || !form.schema || !form.table) { setColumns([]); return; } getTableColumns(form.database, form.schema, form.table).then(cols => setColumns((cols || []).map((c: any) => c.name || c.COLUMN_NAME))).catch(() => setColumns([])); }, [form.database, form.schema, form.table]);

  const handleApply = async () => {
    setLoading(true);
    try {
      await applyMaskingPolicy(form);
      onSuccess?.();
      onClose();
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleApply(); }} className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="database" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Database
            </label>
            <Select value={form.database} onValueChange={(v) => setForm({ database: v, schema: '', table: '', column: '', policy_name: '' })}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select database" />
              </SelectTrigger>
              <SelectContent>
                {databases.map(db => <SelectItem key={db} value={db}>{db}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="schema" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Schema
            </label>
            <Select value={form.schema} onValueChange={(v) => setForm(prev => ({ ...prev, schema: v, table: '', column: '' }))} disabled={!schemas.length}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select schema" />
              </SelectTrigger>
              <SelectContent>
                {schemas.map(sc => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="table" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Table
            </label>
            <Select value={form.table} onValueChange={(v) => setForm(prev => ({ ...prev, table: v, column: '' }))} disabled={!tables.length}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map(tb => <SelectItem key={tb} value={tb}>{tb}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="column" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Column
            </label>
            <Select value={form.column} onValueChange={(v) => setForm(prev => ({ ...prev, column: v }))} disabled={!columns.length}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select column" />
              </SelectTrigger>
              <SelectContent>
                {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="policy_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Policy Name
          </label>
          <Input
            id="policy_name"
            value={form.policy_name}
            onChange={e => setForm(prev => ({ ...prev, policy_name: e.target.value }))}
            placeholder="Enter existing policy name"
            required
            className="mt-1 block w-full"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Applying...' : 'Apply Policy'}
        </Button>
      </div>
    </form>
  );
}


