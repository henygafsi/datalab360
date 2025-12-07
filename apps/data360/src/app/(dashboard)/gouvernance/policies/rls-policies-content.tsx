'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Input, Modal, Select } from 'rizzui';
import {
  HiOutlineLockClosed,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlinePlay,
} from 'react-icons/hi2';
import { toast } from 'react-hot-toast';
import {
  getRLSPolicies,
  createRLSPolicy,
  applyRLSPolicy,
  removeRLSPolicy,
  deleteRLSPolicy,
  type RLSPolicy,
} from '@/app/services/gouvernance/policies';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';
import { DEFAULTS } from '@/config/database.config';

// Modern Card Component
const ModernCard = ({ children, className = '', ...props }: { children: React.ReactNode; className?: string }) => {
  return (
    <div
      className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-slate-900/20 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default function RLSPoliciesContent() {
  const [policies, setPolicies] = useState<RLSPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<RLSPolicy | null>(null);

  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    policy_name: '',
    signature: '',
    expression: '',
    schema: DEFAULTS.GOVERNANCE_FQN,
    description: '',
    database: '',
    table_name: '',
    filter_expression: '',
  });

  const [applyForm, setApplyForm] = useState({
    database: '',
    schema: '',
    table_name: '',
    policy_column: '',
  });

  useEffect(() => {
    loadPolicies();
    loadDatabases();
  }, []);

  useEffect(() => {
    if (formData.database) {
      loadSchemas(formData.database);
    }
  }, [formData.database]);

  useEffect(() => {
    if (formData.database && formData.schema) {
      loadTables(formData.database, formData.schema);
    }
  }, [formData.database, formData.schema]);

  // Load schemas for Apply modal when database changes
  useEffect(() => {
    if (applyForm.database) {
      loadSchemas(applyForm.database);
    }
  }, [applyForm.database]);

  // Load tables for Apply modal when database/schema changes
  useEffect(() => {
    if (applyForm.database && applyForm.schema) {
      loadTables(applyForm.database, applyForm.schema);
    }
  }, [applyForm.database, applyForm.schema]);

  const loadDatabases = async () => {
    try {
      const dbs = await getDatabases();
      setDatabases(dbs || []);
    } catch (error) {
      console.error('Error loading databases:', error);
    }
  };

  const loadSchemas = async (database: string) => {
    try {
      const schs = await getSchemas(database);
      setSchemas(schs || []);
    } catch (error) {
      console.error('Error loading schemas:', error);
    }
  };

  const loadTables = async (database: string, schema: string) => {
    try {
      const tbls = await getTablesTarget(database, schema);
      setTables(tbls || []);
    } catch (error) {
      console.error('Error loading tables:', error);
    }
  };

  const loadPolicies = async () => {
    try {
      setLoading(true);
      const data = await getRLSPolicies();
      console.log('=== LOAD RLS POLICIES DEBUG ===');
      console.log('Raw API response:', data);
      console.log('Number of policies:', data?.length);
      console.log('Is array:', Array.isArray(data));
      if (data && data.length > 0) {
        console.log('First policy structure:', data[0]);
        console.log('First policy fields:', {
          policy_name: data[0]?.policy_name,
          signature: data[0]?.signature,
          expression: data[0]?.expression,
          filter_expression: data[0]?.filter_expression,
          schema: data[0]?.schema,
          database: data[0]?.database,
          table_name: data[0]?.table_name,
          active: data[0]?.active
        });
      }
      // Defensive check: ensure data is an array
      setPolicies(Array.isArray(data) ? data : []);
    } catch (error: any) {
      console.error('=== LOAD POLICIES ERROR ===');
      console.error('Error object:', error);
      console.error('Error response:', error.response?.data);
      toast.error(error.message || 'Failed to load RLS policies');
      setPolicies([]); // Set empty array on error to prevent crashes
    } finally {
      setLoading(false);
    }
  };

  // Helper function to format error messages from API responses
  const formatErrorMessage = (error: any, defaultMessage: string): string => {
    // Handle FastAPI validation errors (422) which return detail as an array
    if (error.response?.data?.detail) {
      const detail = error.response.data.detail;

      // If detail is an array of validation errors
      if (Array.isArray(detail)) {
        return detail.map((err: any) => err.msg || JSON.stringify(err)).join(', ');
      }
      // If detail is a string
      else if (typeof detail === 'string') {
        return detail;
      }
    }

    if (error.response?.data?.message) {
      return error.response.data.message;
    }

    if (error.message) {
      return error.message;
    }

    return defaultMessage;
  };

  const handleCreate = async () => {
    // Validate required fields
    if (!formData.policy_name || !formData.signature || !formData.expression) {
      toast.error('Please fill in all required fields: Policy Name, Signature, and Expression');
      return;
    }

    try {
      await createRLSPolicy({
        policy_name: formData.policy_name.trim().toUpperCase(),
        signature: formData.signature.trim(),
        expression: formData.expression.trim(),
        schema: formData.schema || DEFAULTS.GOVERNANCE_FQN,
        description: formData.description?.trim(),
      });
      toast.success('RLS Policy created successfully');
      setShowCreateModal(false);
      resetForm();
      loadPolicies();
    } catch (error: any) {
      console.error('Create RLS policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to create RLS policy'));
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy) return;

    // Validate all required fields
    if (!applyForm.database || !applyForm.schema || !applyForm.table_name || !applyForm.policy_column) {
      toast.error('Please fill in all required fields: Database, Schema, Table, and Policy Column');
      return;
    }

    try {
      await applyRLSPolicy({
        policy_name: selectedPolicy.policy_name,
        table_name: applyForm.table_name,
        database: applyForm.database,
        schema: applyForm.schema,
        policy_column: applyForm.policy_column,
        policy_schema: selectedPolicy.schema || DEFAULTS.GOVERNANCE_FQN,
      });
      toast.success(`RLS Policy applied to ${applyForm.database}.${applyForm.schema}.${applyForm.table_name}`);
      setShowApplyModal(false);
      setSelectedPolicy(null);
      resetApplyForm();
      loadPolicies();
    } catch (error: any) {
      console.error('Apply RLS policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to apply RLS policy'));
    }
  };

  const handleDelete = async (policy: RLSPolicy) => {
    if (!confirm(`Delete RLS policy "${policy.policy_name}"? This cannot be undone.`)) return;

    console.log('=== DELETE RLS POLICY DEBUG ===');
    console.log('Policy object:', policy);
    console.log('Policy name:', policy.policy_name);
    console.log('Policy schema:', policy.schema);
    console.log('Using schema:', policy.schema || DEFAULTS.GOVERNANCE_FQN);

    try {
      const result = await deleteRLSPolicy(policy.policy_name, policy.schema || DEFAULTS.GOVERNANCE_FQN);
      console.log('Delete API result:', result);
      toast.success('RLS Policy deleted successfully');
      // Wait a bit before reloading to let backend process
      setTimeout(() => loadPolicies(), 500);
    } catch (error: any) {
      console.error('=== DELETE ERROR ===');
      console.error('Full error object:', error);
      console.error('Response data:', error.response?.data);
      console.error('Response status:', error.response?.status);
      console.error('Error message:', error.message);
      toast.error(formatErrorMessage(error, 'Failed to delete RLS policy'));
    }
  };

  const handleRemove = async (policy: RLSPolicy) => {
    // Validate required fields
    if (!policy.table_name || !policy.database || !policy.schema) {
      toast.error('Cannot remove policy: missing table information. Please ensure the policy is applied to a table first.');
      console.error('Remove RLS policy validation error:', {
        policy_name: policy.policy_name,
        table_name: policy.table_name,
        database: policy.database,
        schema: policy.schema,
      });
      return;
    }

    if (!confirm(`Remove RLS policy from ${policy.database}.${policy.schema}.${policy.table_name}?`)) return;

    try {
      await removeRLSPolicy(policy.table_name, policy.database, policy.schema);
      toast.success('RLS Policy removed successfully');
      loadPolicies();
    } catch (error: any) {
      console.error('Remove RLS policy error:', error.response?.data || error);
      toast.error(formatErrorMessage(error, 'Failed to remove RLS policy'));
    }
  };

  const resetForm = () => {
    setFormData({
      policy_name: '',
      signature: '',
      expression: '',
      schema: DEFAULTS.GOVERNANCE_FQN,
      description: '',
      database: '',
      table_name: '',
      filter_expression: '',
    });
  };

  const resetApplyForm = () => {
    setApplyForm({
      database: '',
      schema: '',
      table_name: '',
      policy_column: '',
    });
  };

  const stats = {
    total: policies?.length || 0,
    active: policies?.filter(p => p?.active)?.length || 0,
    inactive: policies?.filter(p => !p?.active)?.length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Action Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/30"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create RLS Policy
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Policies</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/30 dark:to-indigo-900/30 flex items-center justify-center">
              <HiOutlineLockClosed className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </ModernCard>

        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Active</p>
              <p className="text-3xl font-bold text-green-600">{stats.active}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 flex items-center justify-center">
              <HiOutlineCheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </ModernCard>

        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Inactive</p>
              <p className="text-3xl font-bold text-slate-600">{stats.inactive}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
              <HiOutlineXCircle className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            </div>
          </div>
        </ModernCard>
      </div>

      {/* Policies List */}
      <ModernCard className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">RLS Policies</h2>
          <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
            {policies.length} policies
          </Badge>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-slate-600 dark:text-slate-400">Loading RLS policies...</p>
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-12">
            <HiOutlineLockClosed className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">No RLS policies created yet</p>
            <Button onClick={() => setShowCreateModal(true)} className="mt-4">
              Create your first policy
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {policies.map((policy, idx) => (
              <div
                key={idx}
                className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{String(policy.policy_name || '')}</h3>
                      {policy.active ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <HiOutlineCheckCircle className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">
                          <HiOutlineXCircle className="w-3 h-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </div>

                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 mb-1">Signature</p>
                        <code className="text-sm bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 px-3 py-1.5 rounded font-mono">
                          {String(policy.signature || 'N/A')}
                        </code>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 mb-1">Expression</p>
                        <code className="text-sm bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded block font-mono">
                          {String(policy.expression || policy.filter_expression || 'N/A')}
                        </code>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-slate-500 dark:text-slate-400 mb-1">Schema</p>
                          <p className="font-medium text-slate-900 dark:text-white">{String(policy.schema || 'N/A')}</p>
                        </div>
                        {policy.table_name && (
                          <div>
                            <p className="text-slate-500 dark:text-slate-400 mb-1">Applied To</p>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {String(policy.database || '')}.{String(policy.table_name || '')}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {policy.description && (
                      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{String(policy.description)}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPolicy(policy);
                        setShowApplyModal(true);
                      }}
                      className="text-purple-600 hover:bg-purple-50"
                    >
                      <HiOutlinePlay className="w-4 h-4 mr-1" />
                      Apply
                    </Button>
                    {policy.table_name && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemove(policy)}
                        className="text-amber-600 hover:bg-amber-50"
                        title="Unapply from table"
                      >
                        <HiOutlineXCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(policy)}
                      className="text-red-600 hover:bg-red-50"
                      title="Delete policy"
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ModernCard>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }}>
        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <HiOutlinePlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Create RLS Policy</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Define row-level security filter</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Policy Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.policy_name}
                onChange={(e) => setFormData({ ...formData, policy_name: e.target.value })}
                placeholder="e.g., RESTRICT_BY_REGION"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Signature <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.signature}
                onChange={(e) => setFormData({ ...formData, signature: e.target.value })}
                placeholder="e.g., (val VARCHAR)"
                className="font-mono"
              />
              <p className="mt-1 text-xs text-slate-500">
                Function signature defining the input parameter type (e.g., (val VARCHAR), (user_id NUMBER))
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Expression <span className="text-red-500">*</span>
              </label>
              <textarea
                value={formData.expression}
                onChange={(e) => setFormData({ ...formData, expression: e.target.value })}
                placeholder="e.g., CURRENT_ROLE() IN ('ADMIN', 'MANAGER') OR val = CURRENT_USER()"
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">
                Boolean SQL expression that determines row access. Use context functions like CURRENT_ROLE(), CURRENT_USER()
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => { setShowCreateModal(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.policy_name || !formData.signature || !formData.expression}
              className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white"
            >
              Create Policy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Apply Modal */}
      <Modal isOpen={showApplyModal} onClose={() => { setShowApplyModal(false); setSelectedPolicy(null); resetApplyForm(); }}>
        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <HiOutlinePlay className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Apply RLS Policy</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Apply "{selectedPolicy?.policy_name}" to a table
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Database <span className="text-red-500">*</span>
                </label>
                <Select
                  value={applyForm.database}
                  onChange={(value: any) => {
                    const dbValue = typeof value === 'object' ? value?.value : value;
                    setApplyForm({ ...applyForm, database: dbValue || '', schema: '', table_name: '', policy_column: '' });
                  }}
                  options={[
                    { label: 'Select Database', value: '' },
                    ...(databases || []).map(db => ({ label: db, value: db }))
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Schema <span className="text-red-500">*</span>
                </label>
                <Select
                  value={applyForm.schema}
                  onChange={(value: any) => {
                    const schValue = typeof value === 'object' ? value?.value : value;
                    setApplyForm({ ...applyForm, schema: schValue || '', table_name: '', policy_column: '' });
                  }}
                  disabled={!applyForm.database}
                  options={[
                    { label: 'Select Schema', value: '' },
                    ...(schemas || []).map(sch => ({ label: sch, value: sch }))
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Table <span className="text-red-500">*</span>
                </label>
                <Select
                  value={applyForm.table_name}
                  onChange={(value: any) => {
                    const tblValue = typeof value === 'object' ? value?.value : value;
                    setApplyForm({ ...applyForm, table_name: tblValue || '', policy_column: '' });
                  }}
                  disabled={!applyForm.schema}
                  options={[
                    { label: 'Select Table', value: '' },
                    ...(tables || []).map(tbl => ({ label: tbl, value: tbl }))
                  ]}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Policy Column <span className="text-red-500">*</span>
              </label>
              <Input
                value={applyForm.policy_column}
                onChange={(e) => setApplyForm({ ...applyForm, policy_column: e.target.value })}
                placeholder="e.g., USER_ID, REGION, DEPARTMENT"
                disabled={!applyForm.table_name}
              />
              <p className="mt-1 text-xs text-slate-500">
                The column name that will be passed to the policy function signature
              </p>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => { setShowApplyModal(false); setSelectedPolicy(null); resetApplyForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!applyForm.database || !applyForm.schema || !applyForm.table_name || !applyForm.policy_column}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white"
            >
              Apply Policy
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
