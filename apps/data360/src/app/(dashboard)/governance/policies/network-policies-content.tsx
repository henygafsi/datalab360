'use client';

import { useState, useCallback } from 'react';
import { Button, Input } from 'rizzui';
import { useCanPerform } from '@/hooks/useCanPerform';
import { toast } from 'react-hot-toast';
import { HiOutlinePlus, HiCheckCircle } from 'react-icons/hi2';
import { RefreshCw } from 'lucide-react';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getNetworkPolicies,
  getNetworkPolicyDetails,
  createNetworkPolicy,
  setNetworkPolicyAsDefault,
  deleteNetworkPolicy,
  formatPolicyError,
  type NetworkPolicy,
  type EnrichedPolicy,
} from '@/app/services/governance/policies';
import PolicyCard from './components/PolicyCard';
import PolicyFormPanel from '@/app/shared/governance/policy-form-panel';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';

interface NetworkPolicyDetails {
  policy_name?: string;
  allowed_ip_list?: string;
  blocked_ip_list?: string;
  comment?: string;
  details?: { allowed_ip_list?: string; blocked_ip_list?: string; comment?: string };
}

/** Map a raw NetworkPolicy to the EnrichedPolicy shape expected by PolicyCard. */
function networkToEnriched(p: NetworkPolicy): EnrichedPolicy {
  return {
    name: p.policy_name || p.name || '',
    database_name: '',
    schema_name: '',
    created_on: p.created_at || null,
    comment: p.comment || p.description || null,
    granted_roles: p.granted_roles || [],
    granted_objects: [],
    granted_objects_count: 0,
    expiration_date: p.expiration_date || null,
  };
}

export default function NetworkPoliciesContent() {
  // System 2 Action-RBAC: Create → gouvernance:create, Set-as-default → gouvernance:apply.
  // Fail-open while the allow-set loads (no flash of disabled).
  const createPerm = useCanPerform('gouvernance', 'create');
  const applyPerm = useCanPerform('gouvernance', 'apply');
  const canCreatePolicy = createPerm.allowed || createPerm.loading;
  const canApplyPolicy = applyPerm.allowed || applyPerm.loading;

  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<NetworkPolicy | null>(null);
  const [policyDetails, setPolicyDetails] = useState<NetworkPolicyDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form state
  const [policyName, setPolicyName] = useState('');
  const [allowedIPs, setAllowedIPs] = useState('');
  const [blockedIPs, setBlockedIPs] = useState('');
  const [comment, setComment] = useState('');
  const [expirationDate, setExpirationDate] = useState('');

  // Cache-aware query: auto-fetches and auto-refreshes on SSE invalidation
  const fetchPolicies = useCallback(() => getNetworkPolicies().then(data => Array.isArray(data) ? data : []), []);
  const { data: policies, loading, error, refetch, isStale } = useCacheAwareQuery<NetworkPolicy[]>(
    fetchPolicies,
    { cacheKeys: [CACHE_KEYS.POLICIES], initialData: [] }
  );

  const handleViewDetails = async (policy: EnrichedPolicy) => {
    // Find the raw NetworkPolicy to keep raw fields for the details modal
    const raw = policies?.find(p => (p.policy_name || p.name) === policy.name) ?? null;
    setSelectedPolicy(raw);
    setShowDetailsPanel(true);
    setLoadingDetails(true);
    setPolicyDetails(null);
    setDetailsError(null);

    try {
      const details: NetworkPolicyDetails | null = await getNetworkPolicyDetails(policy.name);
      if (!details) {
        setDetailsError('No details returned for this policy.');
      } else {
        setPolicyDetails(details);
      }
    } catch (error) {
      setDetailsError(formatPolicyError(error, 'Failed to load policy details'));
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleCreate = async () => {
    if (!policyName) {
      setCreateError('Please provide a policy name.');
      return;
    }

    if (!allowedIPs && !blockedIPs) {
      setCreateError('Please specify at least one allowed or blocked IP range.');
      return;
    }

    setCreateError(null);
    try {
      const requestData = {
        policy_name: policyName,
        allowed_ip_list: allowedIPs.trim() || undefined,
        blocked_ip_list: blockedIPs.trim() || undefined,
        comment: comment.trim() || undefined,
        expiration_date: expirationDate || undefined,
      };

      await createNetworkPolicy(requestData);

      toast.success('Network policy created successfully!');
      setShowCreatePanel(false);
      resetForm();
      refetch();
    } catch (error) {
      setCreateError(formatPolicyError(error, 'Failed to create policy'));
    }
  };

  const handleSetAsDefault = async (policy: NetworkPolicy) => {
    try {
      await setNetworkPolicyAsDefault(policy.name);
      toast.success('Network policy set as account default');
      refetch();
    } catch (error: any) {
      console.error('Set network policy as default error:', error.response?.data || error);
      toast.error(formatPolicyError(error, 'Failed to set as default'));
    }
  };

  const handleDeletePolicy = async (enriched: EnrichedPolicy) => {
    await deleteNetworkPolicy(enriched.name);
  };

  const resetForm = () => {
    setPolicyName('');
    setAllowedIPs('');
    setBlockedIPs('');
    setComment('');
    setExpirationDate('');
    setCreateError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">Network Policies</h2>
            {isStale && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Syncing...</span>
              </div>
            )}
          </div>
          <p className="text-slate-600 dark:text-slate-400">
            Control access based on IP addresses and network locations
          </p>
        </div>
        <Button
          onClick={() => { setCreateError(null); setShowCreatePanel(true); }}
          disabled={!canCreatePolicy}
          title={!canCreatePolicy ? 'You lack the "create" permission on governance. Ask an administrator to grant it.' : undefined}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create Policy
        </Button>
      </div>

      {/* Policies List */}
      {loading ? (
        <TableSkeleton rows={4} columns={3} showHeader={false} />
      ) : error ? (
        <ErrorDisplay error={error.message} onRetry={() => refetch()} context="general" />
      ) : !policies || policies.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          No network policies found. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {policies.map((policy) => {
            const enriched = networkToEnriched(policy);
            return (
              <PolicyCard
                key={policy.name}
                policy={enriched}
                accentColor="blue"
                policyType="network"
                onViewDetails={handleViewDetails}
                onDelete={handleDeletePolicy}
                onRefresh={refetch}
                entityLabel="object(s)"
              >
                {/* IP lists */}
                <div className="grid grid-cols-2 gap-4 mt-2">
                  {policy.allowed_ip_list && (
                    <div>
                      <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">
                        Allowed IPs:
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded">
                        {String(policy.allowed_ip_list)}
                      </p>
                    </div>
                  )}
                  {policy.blocked_ip_list && (
                    <div>
                      <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">
                        Blocked IPs:
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-900 p-2 rounded">
                        {String(policy.blocked_ip_list)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Set as Default action */}
                {!policy.is_default && (
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetAsDefault(policy)}
                      disabled={!canApplyPolicy}
                      title={!canApplyPolicy ? 'You lack the "apply" permission on governance. Ask an administrator to grant it.' : undefined}
                      className="gap-1"
                    >
                      <HiCheckCircle className="w-4 h-4" />
                      Set as Default
                    </Button>
                  </div>
                )}
              </PolicyCard>
            );
          })}
        </div>
      )}

      {/* Create Policy Panel */}
      <PolicyFormPanel
        isOpen={showCreatePanel}
        onClose={() => setShowCreatePanel(false)}
        title="Create Network Policy"
        description="Restrict account access by IP address or CIDR range"
        accentClassName="bg-blue-500"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowCreatePanel(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!canCreatePolicy} className="bg-blue-600 hover:bg-blue-700">Create Policy</Button>
          </>
        }
      >
          <Input
            label="Policy Name"
            placeholder="OFFICE_NETWORK_POLICY"
            value={policyName}
            onChange={(e) => setPolicyName(e.target.value.toUpperCase())}
          />

          <div>
            <label className="block text-sm font-medium mb-2">
              Allowed IP List
            </label>
            <textarea
              className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              rows={3}
              value={allowedIPs}
              onChange={(e) => setAllowedIPs(e.target.value)}
              placeholder="192.168.1.0/24, 10.0.0.0/8"
            />
            <p className="text-xs text-slate-500 mt-1">
              Comma-separated list of allowed IP addresses or CIDR ranges
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Blocked IP List (Optional)
            </label>
            <textarea
              className="w-full p-3 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              rows={3}
              value={blockedIPs}
              onChange={(e) => setBlockedIPs(e.target.value)}
              placeholder="203.0.113.0/24"
            />
            <p className="text-xs text-slate-500 mt-1">
              Comma-separated list of blocked IP addresses or CIDR ranges
            </p>
          </div>

          <Input
            label="Comment (Optional)"
            placeholder="Office network access policy"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />

          <div>
            <label className="block text-sm font-medium mb-2">Expiration Date</label>
            <Input
              type="datetime-local"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Optional. Defaults to 7 days from creation if not specified.
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Note:</strong> Network policies are account-level and apply globally.
              Use &quot;Set as Default&quot; after creation to activate.
            </p>
          </div>

          {createError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {createError}
            </p>
          )}
      </PolicyFormPanel>

      {/* Policy Details Panel */}
      <PolicyFormPanel
        isOpen={showDetailsPanel}
        onClose={() => setShowDetailsPanel(false)}
        title={`Policy Details: ${selectedPolicy?.name ?? ''}`}
        accentClassName="bg-blue-500"
        footer={<Button variant="outline" onClick={() => setShowDetailsPanel(false)}>Close</Button>}
      >
          {loadingDetails ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-slate-500">Loading details...</p>
            </div>
          ) : detailsError ? (
            <ErrorDisplay error={detailsError} onRetry={() => selectedPolicy && handleViewDetails(networkToEnriched(selectedPolicy))} context="general" />
          ) : policyDetails ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Policy Name
                </label>
                <code className="block bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm font-mono">
                  {policyDetails.policy_name || selectedPolicy?.name || '—'}
                </code>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Allowed IP List
                </label>
                <pre className="block bg-green-50 dark:bg-green-900/20 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap text-green-700 dark:text-green-300">
                  {policyDetails.details?.allowed_ip_list || policyDetails.allowed_ip_list || selectedPolicy?.allowed_ip_list || 'None'}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Blocked IP List
                </label>
                <pre className="block bg-red-50 dark:bg-red-900/20 p-3 rounded-lg text-sm font-mono overflow-x-auto whitespace-pre-wrap text-red-700 dark:text-red-300">
                  {policyDetails.details?.blocked_ip_list || policyDetails.blocked_ip_list || selectedPolicy?.blocked_ip_list || 'None'}
                </pre>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Comment
                </label>
                <p className="text-sm">{policyDetails.details?.comment || policyDetails.comment || selectedPolicy?.comment || 'No comment'}</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              No details available
            </div>
          )}
      </PolicyFormPanel>
    </div>
  );
}
