'use client';

import { useState, useEffect } from 'react';
import { Button, Input, Modal } from 'rizzui';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';
import {
  getAggregationPolicies,
  createAggregationPolicy,
  applyAggregationPolicy,
  removeAggregationPolicy,
  deleteAggregationPolicy,
  type AggregationPolicy,
} from '@/app/services/gouvernance/policies';
import { ObjectSelector } from './components/ObjectSelector';

export default function AggregationPoliciesContent() {
  const [policies, setPolicies] = useState<AggregationPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<AggregationPolicy | null>(null);

  // Form state for creating policy
  const [policyName, setPolicyName] = useState('');
  const [aggregationConstraint, setAggregationConstraint] = useState(
    "CASE WHEN COUNT(*) < 5 THEN NULL ELSE COUNT(*) END"
  );

  // Form state for applying policy
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [table, setTable] = useState('');

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const data = await getAggregationPolicies();
      setPolicies(data || []);
    } catch (error: any) {
      console.error('Error loading aggregation policies:', error);
      toast.error(error.response?.data?.message || error.message || 'Failed to load aggregation policies');
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!policyName || !aggregationConstraint) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await createAggregationPolicy({
        policy_name: policyName,
        aggregation_constraint: aggregationConstraint,
        schema: 'cp_data360.GOUVERNANCE',
      });
      toast.success('Aggregation policy created successfully!');
      setShowCreateModal(false);
      resetCreateForm();
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to create policy');
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy || !database || !schema || !table) {
      toast.error('Please select all required fields');
      return;
    }

    try {
      await applyAggregationPolicy({
        policy_name: selectedPolicy.policy_name,
        database,
        schema,
        table,
        policy_schema: 'cp_data360.GOUVERNANCE',
      });
      toast.success(`Policy applied to ${database}.${schema}.${table}`);
      setShowApplyModal(false);
      setSelectedPolicy(null);
      resetApplyForm();
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to apply policy');
    }
  };

  const handleDelete = async (policy: AggregationPolicy) => {
    if (!confirm(`Delete aggregation policy "${policy.policy_name}"?`)) return;

    try {
      await deleteAggregationPolicy(policy.policy_name);
      toast.success('Policy deleted successfully');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'Failed to delete policy');
    }
  };

  const resetCreateForm = () => {
    setPolicyName('');
    setAggregationConstraint("CASE WHEN COUNT(*) < 5 THEN NULL ELSE COUNT(*) END");
  };

  const resetApplyForm = () => {
    setDatabase('');
    setSchema('');
    setTable('');
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Aggregation Policies</h2>
          <p className="text-slate-600 dark:text-slate-400">
            Control how data can be aggregated to prevent small group identification
          </p>
        </div>
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-cyan-600 hover:bg-cyan-700"
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
          No aggregation policies found. Create one to get started.
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
                  Constraint: {policy.aggregation_constraint}
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
                  Apply to Table
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
          <h2 className="text-xl font-bold">Create Aggregation Policy</h2>

          <Input
            label="Policy Name"
            placeholder="MIN_COUNT_5"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value.toUpperCase())}
          />

          <div>
            <label className="block text-sm font-medium mb-2">
              Aggregation Constraint (SQL Expression)
            </label>
            <textarea
              className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              rows={4}
              value={aggregationConstraint}
              onChange={(e) => setAggregationConstraint(e.target.value)}
              placeholder="CASE WHEN COUNT(*) < 5 THEN NULL ELSE COUNT(*) END"
            />
            <p className="text-xs text-slate-500 mt-1">
              Example: Prevent counts less than 5 from being returned
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} className="bg-cyan-600 hover:bg-cyan-700">
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
            Select the table to apply this aggregation policy to:
          </p>

          <ObjectSelector
            level="database"
            onSelect={(val) => {
              setDatabase(val);
              setSchema('');
              setTable('');
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
              }}
              value={schema}
            />
          )}

          {schema && (
            <ObjectSelector
              level="table"
              database={database}
              schema={schema}
              onSelect={setTable}
              value={table}
            />
          )}

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setShowApplyModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!database || !schema || !table}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              Apply Policy
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
