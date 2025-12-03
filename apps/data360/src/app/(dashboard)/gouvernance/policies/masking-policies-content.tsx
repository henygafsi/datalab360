'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Modal, Select } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';
import {
  getMaskingPolicies,
  createMaskingPolicy,
  applyMaskingPolicy,
  removeMaskingPolicy,
  deleteMaskingPolicy,
  type MaskingPolicy,
} from '@/app/services/gouvernance/policies';
import { ObjectSelector } from './components/ObjectSelector';

const MASKING_TYPES = [
  { label: 'Full Masking (****)', value: 'FULL' },
  { label: 'Partial Masking (First 4 chars)', value: 'PARTIAL_FIRST' },
  { label: 'Partial Masking (Last 4 chars)', value: 'PARTIAL_LAST' },
  { label: 'Email Masking (user@*****.com)', value: 'EMAIL' },
  { label: 'Hash (SHA256)', value: 'HASH' },
  { label: 'Custom Expression', value: 'CUSTOM' },
];

export default function MaskingPoliciesContent() {
  const [policies, setPolicies] = useState<MaskingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<MaskingPolicy | null>(null);

  // Form state for creating policy
  const [policyName, setPolicyName] = useState('');
  const [columnType, setColumnType] = useState('STRING');
  const [maskingType, setMaskingType] = useState('FULL');
  const [customExpression, setCustomExpression] = useState('');

  // Form state for applying policy
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');
  const [column, setColumn] = useState('');

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const data = await getMaskingPolicies();
      setPolicies(data || []);
    } catch (error: any) {
      console.error('Error loading masking policies:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to load masking policies');
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  };

  const getMaskingExpression = () => {
    if (maskingType === 'CUSTOM') {
      return customExpression;
    }

    const expressions: Record<string, string> = {
      FULL: `'****'`,
      PARTIAL_FIRST: `CONCAT(SUBSTRING(val, 1, 4), '****')`,
      PARTIAL_LAST: `CONCAT('****', SUBSTRING(val, -4))`,
      EMAIL: `CONCAT(SPLIT_PART(val, '@', 1), '@*****.com')`,
      HASH: `SHA2(val, 256)`,
    };

    return expressions[maskingType] || `'****'`;
  };

  const handleCreate = async () => {
    if (!policyName || !columnType) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (maskingType === 'CUSTOM' && !customExpression) {
      toast.error('Please provide a custom masking expression');
      return;
    }

    try {
      await createMaskingPolicy({
        policy_name: policyName,
        column_type: columnType,
        masking_expression: getMaskingExpression(),
        schema: 'cp_data360.GOUVERNANCE',
      });
      toast.success('Masking policy created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to create policy');
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy || !database || !schema || !table || !column) {
      toast.error('Please select all required fields');
      return;
    }

    try {
      await applyMaskingPolicy({
        policy_name: selectedPolicy.policy_name,
        database,
        schema,
        table,
        column,
        policy_schema: 'cp_data360.GOUVERNANCE',
      });
      toast.success(`Policy applied to ${database}.${schema}.${table}.${column}`);
      setShowApplyModal(false);
      setSelectedPolicy(null);
      resetApplyForm();
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to apply policy');
    }
  };

  const handleDelete = async (policy: MaskingPolicy) => {
    if (!confirm(`Delete masking policy "${policy.policy_name}"?`)) return;

    try {
      await deleteMaskingPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to delete policy');
    }
  };

  const resetCreateForm = () => {
    setPolicyName('');
    setColumnType('STRING');
    setMaskingType('FULL');
    setCustomExpression('');
  };

  const resetApplyForm = () => {
    setDatabase('');
    setSchema('');
    setTable('');
    setColumn('');
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Masking Policies</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Protect sensitive data with column-level masking policies
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-amber-600 hover:bg-amber-700"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Policies List */}
      {loading ? (
        <div className="text-center py-12">Loading...</div>
      ) : policies.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No masking policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => (
            <div
              key={policy.policy_name}
              className="bg-white dark:bg-slate-800 rounded-lg border p-4 flex justify-between items-start"
            >
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{policy.policy_name}</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Type: {policy.column_type}
                </p>
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  {policy.masking_expression}
                </p>
                <p className="text-xs text-slate-500 mt-1">Schema: {policy.schema}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedPolicy(policy);
                    setShowApplyModal(true);
                  }}
                >
                  Apply to Column
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  color="danger"
                  onClick={() => handleDelete(policy)}
                >
                  <HiOutlineTrash className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Policy Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">Create Masking Policy</h2>

          <Input
            label="Policy Name"
            placeholder="MASK_SSN"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value.toUpperCase())}
          />

          <Select
            label="Column Data Type"
            value={columnType}
            onChange={(val) => setColumnType(val as string)}
            options={[
              { label: 'STRING', value: 'STRING' },
              { label: 'VARCHAR', value: 'VARCHAR' },
              { label: 'NUMBER', value: 'NUMBER' },
              { label: 'DATE', value: 'DATE' },
            ]}
          />

          <Select
            label="Masking Type"
            value={maskingType}
            onChange={(val) => setMaskingType(val as string)}
            options={MASKING_TYPES}
          />

          {maskingType === 'CUSTOM' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Custom Masking Expression
              </label>
              <textarea
                className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                rows={3}
                value={customExpression}
                onChange={(e) => setCustomExpression(e.target.value)}
                placeholder="CASE WHEN current_role() IN ('ADMIN') THEN val ELSE '****' END"
              />
              <p className="text-xs text-slate-500 mt-1">
                Use 'val' as the placeholder for the column value
              </p>
            </div>
          )}

          <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded">
            <p className="text-xs font-medium mb-1">Preview Expression:</p>
            <code className="text-xs">{getMaskingExpression()}</code>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-amber-600 hover:bg-amber-700">
              Create Policy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Apply Policy Modal */}
      <Modal isOpen={showApplyModal} onClose={() => setShowApplyModal(false)}>
        <div className="p-6 space-y-4">
          <h2 className="text-xl font-bold">
            Apply Policy: {selectedPolicy?.policy_name}
          </h2>

          <p className="text-sm text-slate-600 dark:text-slate-400">
            Select the column to apply this masking policy to:
          </p>

          <ObjectSelector
            level="database"
            onSelect={(val) => {
              setDatabase(val);
              setSchema('');
              setTable('');
              setColumn('');
            }}
            value={database}
          />

          {database && (
            <ObjectSelector
              level="schema"
              database={database}
              onSelect={(val) => {
                setSchema(val);
                setTable('');
                setColumn('');
              }}
              value={schema}
            />
          )}

          {schema && (
            <ObjectSelector
              level="table"
              database={database}
              schema={schema}
              onSelect={(val) => {
                setTable(val);
                setColumn('');
              }}
              value={table}
            />
          )}

          {table && (
            <ObjectSelector
              level="column"
              database={database}
              schema={schema}
              table={table}
              onSelect={setColumn}
              value={column}
            />
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowApplyModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!database || !schema || !table || !column}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Apply Policy
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
