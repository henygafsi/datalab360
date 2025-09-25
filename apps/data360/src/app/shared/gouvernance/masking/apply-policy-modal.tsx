'use client';

import React from 'react';
import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';

export default function ApplyPolicyModal({ open, onClose, form, onForm, databases, schemas, tables, columns, onApply, loading }: {
  open: boolean;
  onClose: () => void;
  form: { database: string; schema: string; table: string; column: string; policy_name: string };
  onForm: (v: Partial<typeof form>) => void;
  databases: string[];
  schemas: string[];
  tables: string[];
  columns: string[];
  onApply: () => Promise<void> | void;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Apply Policy to Column</h3>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Database</Label>
            <Select value={form.database} onValueChange={(v) => onForm({ database: v, schema: '', table: '', column: '' })}>
              <SelectTrigger><SelectValue placeholder="Select database" /></SelectTrigger>
              <SelectContent>
                {databases.map(db => <SelectItem key={db} value={db}>{db}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Schema</Label>
            <Select value={form.schema} onValueChange={(v) => onForm({ schema: v, table: '', column: '' })} disabled={!schemas.length}>
              <SelectTrigger><SelectValue placeholder="Select schema" /></SelectTrigger>
              <SelectContent>
                {schemas.map(sc => <SelectItem key={sc} value={sc}>{sc}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Table</Label>
            <Select value={form.table} onValueChange={(v) => onForm({ table: v, column: '' })} disabled={!tables.length}>
              <SelectTrigger><SelectValue placeholder="Select table" /></SelectTrigger>
              <SelectContent>
                {tables.map(tb => <SelectItem key={tb} value={tb}>{tb}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Column</Label>
            <Select value={form.column} onValueChange={(v) => onForm({ column: v })} disabled={!columns.length}>
              <SelectTrigger><SelectValue placeholder="Select column" /></SelectTrigger>
              <SelectContent>
                {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Policy Name</Label>
            <Input value={form.policy_name} onChange={e => onForm({ policy_name: e.target.value })} placeholder="Existing policy name" />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={onApply} disabled={loading}>Apply</Button>
          </div>
        </div>
      </div>
    </div>
  );
}


