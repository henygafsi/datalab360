'use client';

import { Button, Input, ModalFooter } from 'rizzui';
import { useState } from 'react';

type AddRoleFormProps = {
  onSubmit?: (data: { role: string; grants: string[] }) => void;
};

export default function AddRoleForm({ onSubmit }: AddRoleFormProps) {
  const [role, setRole] = useState('');
  const [grants, setGrants] = useState<string>('');

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const grantsArray = grants.split(',').map((grant) => grant.trim());
    onSubmit?.({ role, grants: grantsArray });
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-4 p-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Role Name
        </label>
        <Input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Enter role name"
          required
          className="mt-1 block w-full"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Grants (comma-separated)
        </label>
        <Input
          value={grants}
          onChange={(e) => setGrants(e.target.value)}
          placeholder="e.g., BI Reporting, Data Health"
          className="mt-1 block w-full"
        />
      </div>
      <div className="mt-4">
        <Button type="submit" variant="solid" color="primary">
          Add Role
        </Button>
      </div>
    </form>
  );
}
