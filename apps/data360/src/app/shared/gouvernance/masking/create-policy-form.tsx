'use client';

import React, { useState } from 'react';
import { Button, Input, Label } from '@/components/ui';
import { createMaskingPolicy } from '@/app/services/gouvernance/masking';

export default function CreatePolicyForm({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const [form, setForm] = useState({ policy_name: '', data_type: 'STRING', return_type: 'STRING', role_name: '', replace_with: '*******' });
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    try {
      await createMaskingPolicy(form);
      onSuccess?.();
      onClose();
    } catch (e) {
      // Basic fallback; the page toasts errors from service already
      console.error(e);
    } finally { setLoading(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }} className="space-y-4 p-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label htmlFor="policy_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Policy Name
          </label>
          <Input
            id="policy_name"
            value={form.policy_name}
            onChange={e => setForm({ ...form, policy_name: e.target.value })}
            placeholder="Enter policy name"
            required
            className="mt-1 block w-full"
          />
        </div>
        <div>
          <label htmlFor="role_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Role Name
          </label>
          <Input
            id="role_name"
            value={form.role_name}
            onChange={e => setForm({ ...form, role_name: e.target.value })}
            placeholder="Enter role name"
            required
            className="mt-1 block w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="data_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Data Type
            </label>
            <Input
              id="data_type"
              value={form.data_type}
              onChange={e => setForm({ ...form, data_type: e.target.value })}
              placeholder="e.g., STRING"
              required
              className="mt-1 block w-full"
            />
          </div>
          <div>
            <label htmlFor="return_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Return Type
            </label>
            <Input
              id="return_type"
              value={form.return_type}
              onChange={e => setForm({ ...form, return_type: e.target.value })}
              placeholder="e.g., STRING"
              required
              className="mt-1 block w-full"
            />
          </div>
        </div>
        <div>
          <label htmlFor="replace_with" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Replace With
          </label>
          <Input
            id="replace_with"
            value={form.replace_with}
            onChange={e => setForm({ ...form, replace_with: e.target.value })}
            placeholder="e.g., *******"
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
          {loading ? 'Creating...' : 'Create Policy'}
        </Button>
      </div>
    </form>
  );
}


