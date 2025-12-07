'use client';

import { Checkbox, Button, Loader } from 'rizzui';
import { useState } from 'react';
import { toast } from 'react-hot-toast';
import { updateGrants } from '@/app/services/gouvernance/grants';

// Menu modules with their IDs - must match carbonMenuItems
// ID mapping: modules use string names, menu uses numeric IDs
const availableModules = [
  { id: 1, name: 'Connexion', description: 'Data Source Connection' },
  { id: 2, name: 'Mapping', description: 'View and manage mappings' },
  { id: 3, name: 'Workflow', description: 'Workflow management' },
  { id: 4, name: 'BI Reporting', description: 'Business Intelligence reports' },
  { id: 5, name: 'Data Quality', description: 'Data quality reports' },
  { id: 6, name: 'Gouvernance', description: 'User, role, and policy management' },
  { id: 7, name: "KPI's Store", description: 'KPI Store' },
  { id: 8, name: 'DaRquest / DAC', description: 'Data requests' },
  { id: 9, name: 'Observability', description: 'System monitoring' },
  { id: 10, name: 'Intelligent', description: 'AI/ML & Cortex features' },
];

// Legacy module name mapping for backward compatibility
const legacyModuleMapping: Record<string, string> = {
  'Data Health': 'Data Quality',
  'Data Governance': 'Gouvernance',
};

const availableGrants = availableModules.map(m => m.name);

type EditGrantsFormProps = {
  roleName?: string;
  initialGrants?: string[];
  onSubmit?: (updatedGrants: string[]) => void;
  onClose?: () => void;
};

// Normalize module names from legacy to current names
const normalizeModuleName = (name: string): string => {
  return legacyModuleMapping[name] || name;
};

export default function EditGrantsForm({
  roleName = '',
  initialGrants = [],
  onSubmit,
  onClose,
}: EditGrantsFormProps) {
  // Normalize initial grants to handle legacy names
  const normalizedInitialGrants = initialGrants.map(normalizeModuleName);
  const [selectedGrants, setSelectedGrants] = useState<string[]>(normalizedInitialGrants);
  const [saving, setSaving] = useState(false);

  const toggleGrant = (grant: string) => {
    setSelectedGrants((prevGrants) =>
      prevGrants.includes(grant)
        ? prevGrants.filter((g) => g !== grant)
        : [...prevGrants, grant]
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!roleName) {
      toast.error('Role name is required');
      return;
    }

    setSaving(true);
    try {
      await updateGrants(roleName, selectedGrants);
      toast.success(`Grants updated for ${roleName}`);
      onSubmit?.(selectedGrants);
      onClose?.();
    } catch (error: any) {
      console.error('Error updating grants:', error);
      toast.error(error.response?.data?.detail || error.message || 'Failed to update grants');
    } finally {
      setSaving(false);
    }
  };

  // Select all / Deselect all handlers
  const selectAll = () => setSelectedGrants(availableGrants);
  const deselectAll = () => setSelectedGrants([]);

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-4">
      <div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Edit Module Access for <span className="text-blue-600">{roleName}</span>
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Select which modules this role can access in the application menu.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={selectAll}>
          Select All
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={deselectAll}>
          Deselect All
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {availableModules.map((module) => (
          <div
            key={module.id}
            className={`flex items-start p-3 rounded-lg border transition-colors cursor-pointer ${
              selectedGrants.includes(module.name)
                ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            onClick={() => toggleGrant(module.name)}
          >
            <Checkbox
              checked={selectedGrants.includes(module.name)}
              onChange={() => toggleGrant(module.name)}
              className="mt-0.5"
            />
            <div className="ml-3">
              <label className="text-sm font-medium text-slate-900 dark:text-white cursor-pointer">
                {module.name}
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {module.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          variant="solid"
          color="primary"
          disabled={saving}
          className="flex items-center gap-2"
        >
          {saving && <Loader className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save Grants'}
        </Button>
      </div>
    </form>
  );
}
