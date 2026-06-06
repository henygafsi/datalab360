'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge, Button } from 'rizzui';
import {
  HiOutlineKey,
  HiOutlineCog6Tooth,
  HiOutlineShieldExclamation,
  HiOutlineLockClosed,
  HiOutlineUserGroup,
  HiOutlineShieldCheck,
  HiOutlineCube,
  HiOutlinePlus,
  HiOutlinePencilSquare,
  HiOutlineTrash,
  HiOutlineSparkles,
} from 'react-icons/hi2';
import GrantsTable from '@/app/shared/governance/grants/table';
import UserGrantsTable from '@/app/shared/governance/user-grants/table';
import PolicyGrantsTable from '@/app/shared/governance/policy-grants/table';
import StageGrantsTable from '@/app/shared/governance/stage-grants/table';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';
import apiClient from '@/lib/api-client';
import { ActionRail, useActionPanel } from '@/app/shared/action-rail';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  getD360Roles,
  getD360RoleTemplates,
  createD360Role,
  updateD360Role,
  deleteD360Role,
  type D360Role,
  type D360RoleTemplate,
} from '@/app/services/governance/fetch_roles';
import { useCanPerform } from '@/hooks/useCanPerform';
import PermissionGatedButton from '@/components/ui/PermissionGatedButton';

type AsyncStatus = 'idle' | 'running' | 'completed' | 'error';

type TabType = 'role-grants' | 'user-grants' | 'policy-grants' | 'stage-grants' | 'd360-roles' | 'source-product-grants';

function SourceProductGrantsPanel() {
  const [sources, setSources] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [grantRole, setGrantRole] = useState('');
  const [grantTarget, setGrantTarget] = useState('');
  const [grantPrivilege, setGrantPrivilege] = useState('SELECT');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.allSettled([
      apiClient.get('/catalog/sources').then(r => r.data?.sources || []),
      apiClient.get('/catalog/products').then(r => r.data?.products || []),
    ]).then(([s, p]) => {
      if (!mounted) return;
      setSources(s.status === 'fulfilled' ? (Array.isArray(s.value) ? s.value : []) : []);
      setProducts(p.status === 'fulfilled' ? (Array.isArray(p.value) ? p.value : []) : []);
    }).finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleGrant = useCallback(async () => {
    if (!grantRole || !grantTarget) return;
    try {
      await apiClient.post('/gouvernance/grants', { role: grantRole, object: grantTarget, privilege: grantPrivilege });
      setGrantRole(''); setGrantTarget(''); setGrantPrivilege('SELECT');
    } catch { /* handled */ }
  }, [grantRole, grantTarget, grantPrivilege]);

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Source & Product Access</h2>
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"><HiOutlineShieldCheck className="w-3 h-3 mr-1 inline" />Catalog RBAC</Badge>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">Control which roles can access sources (databases, stages) and data products. Grants propagate to Snowflake objects.</p>
      </div>

      {/* Grant form */}
      <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Add Grant</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Role</label>
            <input type="text" placeholder="e.g., DATA_ANALYST" value={grantRole} onChange={(e) => setGrantRole(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Target (DB.SCHEMA or product)</label>
            <input type="text" placeholder="e.g., ANALYTICS.PUBLIC" value={grantTarget} onChange={(e) => setGrantTarget(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-400 mb-1">Privilege</label>
            <select value={grantPrivilege} onChange={(e) => setGrantPrivilege(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
              <option value="SELECT">SELECT (read)</option>
              <option value="INSERT">INSERT (write)</option>
              <option value="ALL PRIVILEGES">ALL PRIVILEGES</option>
              <option value="USAGE">USAGE (schema)</option>
              <option value="OWNERSHIP">OWNERSHIP</option>
            </select>
          </div>
        </div>
        <PermissionGatedButton
          module="gouvernance"
          action="grant"
          deniedReason="You lack the &quot;grant&quot; permission on governance. Ask an administrator to grant it."
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={handleGrant}
          disabled={!grantRole || !grantTarget}
        >
          Grant Access
        </PermissionGatedButton>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TableSkeleton rows={5} columns={2} />
          <TableSkeleton rows={5} columns={2} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sources */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 border-b border-blue-200 dark:border-blue-800">
              <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <HiOutlineKey className="h-4 w-4" /> Sources ({sources.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
              {sources.length === 0 ? (
                <EmptyState
                  compact
                  icon={HiOutlineKey}
                  title="No sources"
                  description="Run a catalog refresh to populate sources."
                />
              ) : sources.map((s: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{s.label || s.name || s.source_id || `Source ${i + 1}`}</p>
                    <p className="text-[10px] text-gray-500">{s.source_type || 'database'} · {s.schema_count ?? '—'} schemas · {s.object_count ?? '—'} objects</p>
                  </div>
                  <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">{s.owner || 'SYSADMIN'}</Badge>
                </div>
              ))}
            </div>
          </div>

          {/* Products */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="bg-purple-50 dark:bg-purple-900/20 px-4 py-3 border-b border-purple-200 dark:border-purple-800">
              <h3 className="text-sm font-semibold text-purple-800 dark:text-purple-300 flex items-center gap-2">
                <HiOutlineCube className="h-4 w-4" /> Data Products ({products.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
              {products.length === 0 ? (
                <EmptyState
                  compact
                  icon={HiOutlineCube}
                  title="No data products"
                  description="Create a data product in the Catalog to manage its access here."
                />
              ) : products.map((p: any, i: number) => (
                <div key={i} className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name || p.NAME || `Product ${i + 1}`}</p>
                    <p className="text-[10px] text-gray-500">{p.domain || p.DOMAIN || '—'} · {p.status || p.STATUS || 'draft'}</p>
                  </div>
                  <div className="flex gap-1">
                    {p.quality_score != null && <Badge className="bg-green-100 text-green-700 text-[9px]">Q: {p.quality_score}</Badge>}
                    {p.trust_score != null && <Badge className="bg-amber-100 text-amber-700 text-[9px]">T: {p.trust_score}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * D360 Granular Roles panel — list + inline CRUD for page/module/action-level
 * RBAC roles. Backed by /gouvernance/d360-roles{,/templates,/{role_name}}.
 *
 * UX: list/table stays visible; create/edit happen in a non-blocking ActionRail.
 * Delete is gated behind a strict role check + ConfirmDialog (focus-trapping).
 */
function D360RolesPanel() {
  // RBAC gating seam (System 2) — replaces the old hardcoded D360_ADMIN_ROLES
  // check. Create/edit map to gouvernance:create; destructive delete is gated
  // separately on gouvernance:delete so a create-only role can't drop roles.
  const { allowed: canManage } = useCanPerform('gouvernance', 'create');
  const { allowed: canDelete } = useCanPerform('gouvernance', 'delete');

  const [roles, setRoles] = useState<D360Role[]>([]);
  const [templates, setTemplates] = useState<D360RoleTemplate[]>([]);
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const { panel, isOpen, open, close } = useActionPanel<'create' | 'edit'>();
  const [editTarget, setEditTarget] = useState<D360Role | null>(null);
  const [form, setForm] = useState<{ role_name: string; display_name: string; description: string; template_from: string }>({
    role_name: '', display_name: '', description: '', template_from: '',
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<D360Role | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const reload = useCallback(async () => {
    setStatus('running');
    setLoadError(null);
    try {
      const [r, t] = await Promise.all([
        getD360Roles(),
        getD360RoleTemplates().catch(() => [] as D360RoleTemplate[]),
      ]);
      setRoles(r);
      setTemplates(t);
      setStatus('completed');
    } catch (err: any) {
      setLoadError(err?.response?.data?.detail || err?.message || 'Failed to load D360 roles');
      setRoles([]);
      setStatus('error');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const openCreate = useCallback((templateFrom = '') => {
    setEditTarget(null);
    setFormError(null);
    setForm({ role_name: '', display_name: '', description: '', template_from: templateFrom });
    open('create');
  }, [open]);

  const openEdit = useCallback((r: D360Role) => {
    setEditTarget(r);
    setFormError(null);
    setForm({
      role_name: r.role_name,
      display_name: r.display_name ?? '',
      description: r.description ?? '',
      template_from: '',
    });
    open('edit');
  }, [open]);

  const handleSave = useCallback(async () => {
    setFormError(null);
    if (panel === 'create' && !form.role_name.trim()) {
      setFormError('Role name is required.');
      return;
    }
    setSaving(true);
    try {
      if (panel === 'edit' && editTarget) {
        await updateD360Role(editTarget.role_name, {
          display_name: form.display_name.trim() || undefined,
          description: form.description.trim() || undefined,
        });
        setFeedback({ type: 'success', text: `Role "${editTarget.role_name}" updated.` });
      } else {
        await createD360Role({
          role_name: form.role_name.trim(),
          display_name: form.display_name.trim() || undefined,
          description: form.description.trim() || undefined,
          template_from: form.template_from.trim() || undefined,
        });
        setFeedback({ type: 'success', text: `Role "${form.role_name.trim()}" created.` });
      }
      close();
      await reload();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || err?.message || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  }, [panel, form, editTarget, close, reload]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteD360Role(deleteTarget.role_name);
      setFeedback({ type: 'success', text: `Role "${deleteTarget.role_name}" deleted.` });
      setDeleteTarget(null);
      await reload();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.response?.data?.detail || err?.message || 'Failed to delete role' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, reload]);

  return (
    <div role="tabpanel" id="tabpanel-d360-roles" aria-labelledby="tab-d360-roles">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">D360 Granular Roles</h2>
            <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
              <HiOutlineCog6Tooth className="w-3 h-3 mr-1 inline" />
              Page-Level RBAC
            </Badge>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Custom Data360 roles with module/page/tab/action-level permissions. Apply standard templates or build custom roles.</p>
        </div>
        <PermissionGatedButton
          module="gouvernance"
          action="create"
          size="sm"
          onClick={() => openCreate()}
          deniedReason="Requires the create permission on Governance → Roles (Action-RBAC)."
          className="shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
        >
          <HiOutlinePlus className="w-4 h-4 mr-1.5" />
          New Role
        </PermissionGatedButton>
      </div>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            feedback.type === 'success'
              ? 'border border-green-300 bg-green-50 text-green-700 dark:border-green-700/60 dark:bg-green-900/20 dark:text-green-300'
              : 'border border-red-300 bg-red-50 text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </p>
      )}

      {status === 'running' ? (
        <TableSkeleton rows={5} columns={5} />
      ) : status === 'error' ? (
        <EmptyState
          icon={HiOutlineShieldExclamation}
          title="Couldn't load D360 roles"
          description={loadError ?? 'The roles service is unavailable. Try again shortly.'}
          action={<Button size="sm" variant="outline" onClick={() => void reload()}>Retry</Button>}
        />
      ) : (
        <div className="space-y-4">
          {/* Templates row — click to seed a new role from a template */}
          {templates.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 self-center">Templates:</span>
              {templates.map((t, i) => (
                <button
                  key={t.name || i}
                  type="button"
                  disabled={!canManage}
                  onClick={() => openCreate(t.name)}
                  title={canManage ? `Create a role from "${t.name}"` : 'Requires an admin role'}
                  className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900/20 dark:text-orange-400 dark:hover:bg-orange-900/40"
                >
                  <HiOutlineSparkles className="w-3 h-3" />
                  {t.name || `Template ${i + 1}`}
                </button>
              ))}
            </div>
          )}

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Permissions</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Created</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {roles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-2">
                      <EmptyState
                        icon={HiOutlineCog6Tooth}
                        title="No D360 roles defined yet"
                        description={canManage ? 'Create one or apply a standard template to get started.' : 'No custom roles have been defined.'}
                      />
                    </td>
                  </tr>
                ) : (
                  roles.map((r, i) => {
                    const isSystem = r.is_system === true;
                    return (
                      <tr key={r.role_name || i} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            {r.role_name || '—'}
                            {isSystem && (
                              <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-[9px]">System</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">{r.description || r.display_name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">
                            {r.permission_count ?? '—'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.created_at || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 px-2"
                              disabled={!canManage || isSystem}
                              title={isSystem ? 'System roles cannot be edited' : !canManage ? 'Requires an admin role' : 'Edit role'}
                              onClick={() => openEdit(r)}
                            >
                              <HiOutlinePencilSquare className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-7 px-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              disabled={!canDelete || isSystem}
                              title={isSystem ? 'System roles cannot be deleted' : !canDelete ? 'Requires the "delete" permission on governance' : 'Delete role'}
                              onClick={() => setDeleteTarget(r)}
                            >
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit rail — non-blocking, list stays visible */}
      <ActionRail
        isOpen={isOpen}
        onClose={close}
        title={panel === 'edit' ? 'Edit D360 Role' : 'New D360 Role'}
        description={panel === 'edit' ? editTarget?.role_name : 'Define a custom page/module-level role.'}
        accentClassName="bg-orange-500"
        footer={
          <>
            <Button variant="outline" onClick={close} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving} className="bg-orange-600 hover:bg-orange-700 text-white">
              {saving ? 'Saving…' : panel === 'edit' ? 'Save Changes' : 'Create Role'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {panel === 'create' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Role Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.role_name}
                onChange={(e) => setForm((f) => ({ ...f, role_name: e.target.value }))}
                placeholder="e.g. DATA_ANALYST"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              placeholder="Human-friendly label"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="What this role is for"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>
          {panel === 'create' && form.template_from && (
            <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:bg-orange-900/20 dark:text-orange-300">
              Permissions will be seeded from template <strong>{form.template_from}</strong>.
            </p>
          )}
          {formError && (
            <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
              {formError}
            </p>
          )}
        </div>
      </ActionRail>

      {/* Destructive confirm — focus-trapping modal */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete D360 role?"
        message={
          deleteTarget
            ? `This permanently deletes "${deleteTarget.role_name}" and all its page/module permissions. This cannot be undone.`
            : ''
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete role'}
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </div>
  );
}

export default function GrantsManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('role-grants');

  return (
    <ErrorBoundary>
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        <a href="/" className="hover:text-blue-600">Home</a> / <a href="/governance" className="hover:text-blue-600">Governance</a> / <span className="text-slate-700 dark:text-slate-300">Access Control</span>
      </div>

      <PageHeader
        icon={<HiOutlineKey className="h-6 w-6" />}
        title="Access Control"
        subtitle="Configure role-based access control and manage module permissions"
        color="amber"
        badges={
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-sm font-medium">
            <HiOutlineShieldExclamation className="w-3 h-3 mr-1 inline" />
            Security Center
          </Badge>
        }
      />

      {/* Info Cards — explain each grant type for business users */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50/80 dark:bg-blue-950/30 rounded-xl border border-blue-200/60 dark:border-blue-800/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <HiOutlineKey className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Role Grants</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Which modules each role can access (Connect Data, Workflow, BI, etc.). Controls sidebar menu visibility.</p>
        </div>

        <div className="bg-purple-50/80 dark:bg-purple-950/30 rounded-xl border border-purple-200/60 dark:border-purple-800/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <HiOutlineUserGroup className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">User Grants</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Snowflake role assignments per user. Maps SSO identities (Entra ID, Okta, SAML) to Snowflake roles like SYSADMIN, ANALYST.</p>
        </div>

        <div className="bg-violet-50/80 dark:bg-violet-950/30 rounded-xl border border-violet-200/60 dark:border-violet-800/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <HiOutlineShieldCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Policy Grants</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Security policies (masking, RLS, network) applied to roles. Controls who sees what data and from which IPs.</p>
        </div>

        <div className="bg-teal-50/80 dark:bg-teal-950/30 rounded-xl border border-teal-200/60 dark:border-teal-800/40 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <HiOutlineCube className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            </div>
            <h3 className="font-semibold text-gray-900 dark:text-white">Stage Grants</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">Read/write access to Snowflake stages (data loading areas). Controls which roles can upload or access raw files.</p>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-muted p-6">
        {/* Tabs Header */}
        <div className="flex items-center justify-between mb-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex gap-1" role="tablist" aria-label="Grant type tabs">
            <button
              role="tab"
              aria-selected={activeTab === 'role-grants'}
              aria-controls="tabpanel-role-grants"
              onClick={() => setActiveTab('role-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'role-grants'
                  ? 'border-b-2 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineLockClosed className="h-4 w-4" />
              Role Grants
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                Modules
              </Badge>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'user-grants'}
              aria-controls="tabpanel-user-grants"
              onClick={() => setActiveTab('user-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'user-grants'
                  ? 'border-b-2 border-purple-600 text-purple-600 dark:border-purple-400 dark:text-purple-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineUserGroup className="h-4 w-4" />
              User Grants
              <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                RBAC
              </Badge>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'policy-grants'}
              aria-controls="tabpanel-policy-grants"
              onClick={() => setActiveTab('policy-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'policy-grants'
                  ? 'border-b-2 border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineShieldCheck className="h-4 w-4" />
              Policy Grants
              <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                Policies
              </Badge>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'stage-grants'}
              aria-controls="tabpanel-stage-grants"
              onClick={() => setActiveTab('stage-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'stage-grants'
                  ? 'border-b-2 border-teal-600 text-teal-600 dark:border-teal-400 dark:text-teal-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineCube className="h-4 w-4" />
              Stage Grants
              <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                Snowflake
              </Badge>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'd360-roles'}
              aria-controls="tabpanel-d360-roles"
              onClick={() => setActiveTab('d360-roles')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'd360-roles'
                  ? 'border-b-2 border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineCog6Tooth className="h-4 w-4" />
              D360 Roles
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
                Granular
              </Badge>
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'source-product-grants'}
              onClick={() => setActiveTab('source-product-grants')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === 'source-product-grants'
                  ? 'border-b-2 border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <HiOutlineShieldCheck className="h-4 w-4" />
              Sources & Products
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                Catalog
              </Badge>
            </button>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'role-grants' ? (
          <div role="tabpanel" id="tabpanel-role-grants" aria-labelledby="tab-role-grants">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Role Permission Matrix
                </h2>
                <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  <HiOutlineLockClosed className="w-3 h-3 mr-1 inline" />
                  Module Access Control
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Toggle module access for each Snowflake role. Changes take effect on next user login.</p>
            </div>
            <GrantsTable />
          </div>
        ) : activeTab === 'user-grants' ? (
          <div role="tabpanel" id="tabpanel-user-grants" aria-labelledby="tab-user-grants">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  User Access Management
                </h2>
                <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                  <HiOutlineUserGroup className="w-3 h-3 mr-1 inline" />
                  RBAC
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">View and manage Snowflake roles granted to each user. Users with SSO (Entra ID, Okta, SAML) appear with their identity provider.</p>
            </div>
            <UserGrantsTable />
          </div>
        ) : activeTab === 'stage-grants' ? (
          <div role="tabpanel" id="tabpanel-stage-grants" aria-labelledby="tab-stage-grants">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Stage Access Control
                </h2>
                <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
                  <HiOutlineCube className="w-3 h-3 mr-1 inline" />
                  Snowflake Stages
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Control which roles can read, write, or own data loading stages. Stages are used for file uploads and data ingestion.</p>
            </div>
            <StageGrantsTable />
          </div>
        ) : activeTab === 'd360-roles' ? (
          <D360RolesPanel />
        ) : activeTab === 'source-product-grants' ? (
          <SourceProductGrantsPanel />
        ) : (
          <div role="tabpanel" id="tabpanel-policy-grants" aria-labelledby="tab-policy-grants">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Policy-Role Assignments
                </h2>
                <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400">
                  <HiOutlineShieldCheck className="w-3 h-3 mr-1 inline" />
                  Security Policies
                </Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">View which security policies (masking, RLS, aggregation, network) are assigned to each role. Policies restrict data access automatically.</p>
            </div>
            <PolicyGrantsTable />
          </div>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}
