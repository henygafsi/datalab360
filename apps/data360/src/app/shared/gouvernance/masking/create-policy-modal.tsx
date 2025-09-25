'use client';

import React from 'react';
import { Button, Input, Label } from '@/components/ui';

export default function CreatePolicyModal({ open, onClose, value, onChange, onCreate, loading }: {
  open: boolean;
  onClose: () => void;
  value: { policy_name: string; data_type: string; return_type: string; role_name: string; replace_with: string };
  onChange: (v: Partial<typeof value>) => void;
  onCreate: () => Promise<void> | void;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Create Masking Policy</h3>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Policy Name</Label>
            <Input value={value.policy_name} onChange={e => onChange({ policy_name: e.target.value })} />
          </div>
          <div>
            <Label>Role Name</Label>
            <Input value={value.role_name} onChange={e => onChange({ role_name: e.target.value })} />
          </div>
          <div>
            <Label>Data Type</Label>
            <Input value={value.data_type} onChange={e => onChange({ data_type: e.target.value })} />
          </div>
          <div>
            <Label>Return Type</Label>
            <Input value={value.return_type} onChange={e => onChange({ return_type: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Replace With</Label>
            <Input value={value.replace_with} onChange={e => onChange({ replace_with: e.target.value })} />
          </div>
          <div className="col-span-2 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={onCreate} disabled={loading}>Create</Button>
          </div>
        </div>
      </div>
    </div>
  );
}


