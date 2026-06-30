'use client';

import { useState, useCallback, useEffect } from 'react';
import { Badge, Button } from 'rizzui';
import { HiOutlineShieldCheck, HiOutlineKey } from 'react-icons/hi2';
import { Search } from 'lucide-react';
import RolesTable from '@/app/shared/governance/roles/table';
import AddRoleButton from '@/app/shared/governance/roles/add-role-button';
import ImportButton from '@/app/shared/import-button';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import GovernanceKpiStrip from '../components/GovernanceKpiStrip';
import RoleInspectorPanel from './components/RoleInspectorPanel';
import RoleHierarchyPanel from './components/RoleHierarchyPanel';
import { getRoles } from '@/app/services/governance/fetch_roles';
import { useTrackEvent } from '@/hooks/useTrackEvent';

export default function RolesManagementPage() {
  useTrackEvent(); // fire-and-forget PAGE_VIEW on mount/route change
  const [refreshKey, setRefreshKey] = useState(0);

  // Role inspector (docked right-tab) — pick a role, inspect/edit its grants.
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [picked, setPicked] = useState('');
  const [inspected, setInspected] = useState<string | null>(null);

  const loadRoleNames = useCallback(async () => {
    try {
      const rows = await getRoles();
      setRoleNames(rows.map((r) => r.role).filter(Boolean));
    } catch {
      setRoleNames([]);
    }
  }, []);

  useEffect(() => {
    loadRoleNames();
  }, [loadRoleNames, refreshKey]);

  const handleAddRoleSuccess = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <a href="/" className="hover:text-blue-600">Home</a> / <a href="/governance" className="hover:text-blue-600">Governance</a> / <span className="text-slate-700 dark:text-slate-300">Roles</span>
      </div>

      <PageHeader
        icon={<HiOutlineShieldCheck className="h-6 w-6" />}
        title="Role Management"
        subtitle="Define and manage user roles with specific permissions and access controls"
        color="emerald"
        badges={
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 px-3 py-1 text-sm font-medium">
            <HiOutlineKey className="w-3 h-3 mr-1 inline" />
            Active Roles
          </Badge>
        }
        actions={
          <>
            <ImportButton title="Import Roles" />
            <AddRoleButton onAddRoleSuccess={handleAddRoleSuccess} />
          </>
        }
      />

      {/* Per-page KPI strip — roles · D360 roles · users (honest "—"). */}
      <GovernanceKpiStrip scope="roles" />

      {/* Role inspector launcher — pick a role and open the docked inspector. */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-muted bg-white px-4 py-3 dark:bg-gray-800">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Inspect a role&apos;s object grants &amp; hierarchy
          </label>
          <input
            type="text"
            list="roles-page-role-list"
            value={picked}
            onChange={(e) => setPicked(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && picked.trim()) setInspected(picked.trim());
            }}
            placeholder="Select or type a role name"
            className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <datalist id="roles-page-role-list">
            {roleNames.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>
        <Button
          size="sm"
          onClick={() => picked.trim() && setInspected(picked.trim())}
          disabled={!picked.trim()}
          className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          <Search className="h-3.5 w-3.5" />
          Inspect role
        </Button>
      </div>

      {/* Role hierarchy — read-only collapsible inventory (SHOW ROLES counts).
          Click a role to open the docked inspector for its real grants/edges. */}
      <RoleHierarchyPanel
        refreshSignal={refreshKey}
        onInspectRole={(role) => {
          setPicked(role);
          setInspected(role);
        }}
      />

      {/* Main Content + docked inspector (flex siblings, not a modal). */}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
          <RolesTable key={refreshKey} />
        </div>
        <RoleInspectorPanel
          role={inspected}
          candidateRoles={roleNames}
          onClose={() => setInspected(null)}
          onMutated={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    </div>
    </ErrorBoundary>
  );
}
