'use client';

import { useState } from 'react';
import { Button, Input } from 'rizzui';
import { addRole } from '@/app/services/gouvernance/fetch_roles';
import { ShieldPlus, Shield, X } from 'lucide-react';


type AddRoleFormProps = {
  onAddRoleSuccess: () => void;
  onClose: () => void;
};

export default function AddRoleForm({ onAddRoleSuccess, onClose }: AddRoleFormProps) {
  const [roleName, setRoleName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFormSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await addRole(roleName);
      onAddRoleSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add role.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-1">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <ShieldPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Add New Role</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Define a new role for access control</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close form"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="h-px bg-gray-100 dark:bg-gray-700" />

      {/* Form */}
      <form onSubmit={handleFormSubmit} className="space-y-5 px-5 pt-5 pb-6">
        <Input
          label="Role Name"
          placeholder="e.g. DATA_ENGINEER"
          prefix={<Shield className="h-4 w-4 text-gray-400" />}
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
          required
        />

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/30 px-4 py-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1"
            isLoading={loading}
          >
            <ShieldPlus className="me-1.5 h-4 w-4" />
            Add Role
          </Button>
        </div>
      </form>
    </div>
  );
}
