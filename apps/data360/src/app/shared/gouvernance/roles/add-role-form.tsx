// C:\Users\banno\OneDrive\Bureau\datalab360Front\apps\data360\src\app\shared\gouvernance\roles\add-role-form.tsx

'use client';

import { Button, Input } from 'rizzui';
import { useState } from 'react';
import { addRole } from '@/app/services/gouvernance/fetch_roles';

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
      await addRole(roleName); // addRole now handles token internally
      console.log('Role added successfully:', roleName);
      onAddRoleSuccess();
      onClose();
    } catch (err: any) {
      console.error('Failed to add role:', err);
      setError(err.message || 'Failed to add role.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4 p-4">
      <div>
        <label htmlFor="roleName" className="block text-sm font-medium text-gray-700">
          Role Name
        </label>
        <Input
          id="roleName"
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
          placeholder="Enter role name"
          required
          className="mt-1 block w-full"
        />
      </div>
      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
      <div className="mt-4">
        <Button type="submit" variant="solid" color="primary" disabled={loading}>
          {loading ? 'Adding Role...' : 'Add Role'}
        </Button>
      </div>
    </form>
  );
}