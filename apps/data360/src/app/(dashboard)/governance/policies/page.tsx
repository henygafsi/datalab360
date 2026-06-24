'use client';

import { Suspense, useState, useCallback } from 'react';
import Link from 'next/link';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import {
  PiShieldCheck,
  PiLockKey,
  PiGlobe,
  PiEyeSlash,
  PiChartBar,
  PiChartLineUp,
  PiTag,
  PiKey,
  PiSparkle,
  PiPencilSimple,
} from 'react-icons/pi';

// Import existing policy components (we'll use their content)
import RLSPoliciesContent from './rls-policies-content';
import NetworkPoliciesContent from './network-policies-content';
import MaskingPoliciesContent from './masking-policies-content';
import AggregationPoliciesContent from './aggregation-policies-content';
import TagPoliciesContent from './tag-policies-content';
import PasswordPoliciesContent from './password-policies-content';
import SessionPoliciesContent from './session-policies-content';
import DMFContent from './dmf-content';
import ClassificationContent from './classification-content';
import GovernanceDepthPanel from '../components/GovernanceDepthPanel';
import GovernanceKpiStrip from '../components/GovernanceKpiStrip';
import GovernanceTagsPanel from '../components/GovernanceTagsPanel';
import MyRolePoliciesContent from './my-role-policies-content';
import ProposedPoliciesPanel from './components/ProposedPoliciesPanel';
import PolicyMetadataPanel, { type MetadataPolicyType } from './components/PolicyMetadataPanel';

type TabType =
  | 'rls'
  | 'masking'
  | 'aggregation'
  | 'network'
  | 'tag'
  | 'classification'
  | 'dmf'
  | 'password'
  | 'session';

type TabDef = {
  id: TabType;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  accent: string; // tailwind color name: purple / amber / cyan / ...
};

type TabGroup = {
  label: string;
  tabs: TabDef[];
};

const GROUPS: TabGroup[] = [
  {
    label: 'Data Access',
    tabs: [
      { id: 'rls', name: 'Row Access', icon: PiLockKey, description: 'Row-level security — filter visible rows per role or user', accent: 'purple' },
      { id: 'masking', name: 'Masking', icon: PiEyeSlash, description: 'Dynamically hide or transform column values for unauthorized users', accent: 'amber' },
      { id: 'aggregation', name: 'Aggregation', icon: PiChartBar, description: 'Enforce minimum group size to prevent identification in aggregate queries', accent: 'cyan' },
      { id: 'network', name: 'Network', icon: PiGlobe, description: 'Restrict account access by IP address or network ranges', accent: 'blue' },
    ],
  },
  {
    label: 'Classification & Metrics',
    tabs: [
      { id: 'classification', name: 'Classification', icon: PiSparkle, description: 'Auto-discover and label sensitive columns (PII, PHI, financial)', accent: 'violet' },
      { id: 'tag', name: 'Tags', icon: PiTag, description: 'Assign metadata tags to databases, tables, and columns for governance', accent: 'green' },
      { id: 'dmf', name: 'Data Metrics', icon: PiChartLineUp, description: 'Quantitative data-quality checks (null counts, freshness, uniqueness)', accent: 'teal' },
    ],
  },
  {
    label: 'Authentication',
    tabs: [
      { id: 'password', name: 'Password', icon: PiKey, description: 'Password complexity, rotation and lockout requirements', accent: 'red' },
      { id: 'session', name: 'Session', icon: PiShieldCheck, description: 'Idle timeouts and session duration limits', accent: 'indigo' },
    ],
  },
];

const ALL_TABS: TabDef[] = GROUPS.flatMap((g) => g.tabs);

// Tabs whose policy type exposes the enriched LIST endpoint that backs the
// docked metadata editor (PUT .../policies/{type}/{name}/metadata). Tabs not in
// this map (network/tag/classification/dmf) hide the "Edit metadata" launcher.
const TAB_TO_METADATA_TYPE: Partial<Record<TabType, MetadataPolicyType>> = {
  rls: 'ROW_ACCESS',
  masking: 'MASKING',
  aggregation: 'AGGREGATION',
  password: 'PASSWORD',
  session: 'SESSION',
};

// Tailwind can't see dynamic class names, so enumerate everything statically.
const ACCENT_CLASSES: Record<string, { dot: string; activeBg: string; activeText: string; activeRing: string; hoverBg: string; headerGrad: string; headerIconBg: string }> = {
  purple:  { dot: 'bg-purple-500',  activeBg: 'bg-purple-50 dark:bg-purple-900/30',   activeText: 'text-purple-700 dark:text-purple-300',  activeRing: 'ring-purple-500/30',  hoverBg: 'hover:bg-purple-50/60 dark:hover:bg-purple-900/20',  headerGrad: 'from-purple-500 to-purple-600',  headerIconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' },
  amber:   { dot: 'bg-amber-500',   activeBg: 'bg-amber-50 dark:bg-amber-900/30',     activeText: 'text-amber-700 dark:text-amber-300',    activeRing: 'ring-amber-500/30',   hoverBg: 'hover:bg-amber-50/60 dark:hover:bg-amber-900/20',    headerGrad: 'from-amber-500 to-orange-600',   headerIconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  cyan:    { dot: 'bg-cyan-500',    activeBg: 'bg-cyan-50 dark:bg-cyan-900/30',       activeText: 'text-cyan-700 dark:text-cyan-300',      activeRing: 'ring-cyan-500/30',    hoverBg: 'hover:bg-cyan-50/60 dark:hover:bg-cyan-900/20',      headerGrad: 'from-cyan-500 to-teal-600',      headerIconBg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' },
  blue:    { dot: 'bg-blue-500',    activeBg: 'bg-blue-50 dark:bg-blue-900/30',       activeText: 'text-blue-700 dark:text-blue-300',      activeRing: 'ring-blue-500/30',    hoverBg: 'hover:bg-blue-50/60 dark:hover:bg-blue-900/20',      headerGrad: 'from-blue-500 to-indigo-600',    headerIconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  violet:  { dot: 'bg-violet-500',  activeBg: 'bg-violet-50 dark:bg-violet-900/30',   activeText: 'text-violet-700 dark:text-violet-300',  activeRing: 'ring-violet-500/30',  hoverBg: 'hover:bg-violet-50/60 dark:hover:bg-violet-900/20',  headerGrad: 'from-violet-500 to-fuchsia-600', headerIconBg: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  green:   { dot: 'bg-green-500',   activeBg: 'bg-green-50 dark:bg-green-900/30',     activeText: 'text-green-700 dark:text-green-300',    activeRing: 'ring-green-500/30',   hoverBg: 'hover:bg-green-50/60 dark:hover:bg-green-900/20',    headerGrad: 'from-green-500 to-emerald-600',  headerIconBg: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  teal:    { dot: 'bg-teal-500',    activeBg: 'bg-teal-50 dark:bg-teal-900/30',       activeText: 'text-teal-700 dark:text-teal-300',      activeRing: 'ring-teal-500/30',    hoverBg: 'hover:bg-teal-50/60 dark:hover:bg-teal-900/20',      headerGrad: 'from-teal-500 to-cyan-600',      headerIconBg: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  red:     { dot: 'bg-red-500',     activeBg: 'bg-red-50 dark:bg-red-900/30',         activeText: 'text-red-700 dark:text-red-300',        activeRing: 'ring-red-500/30',     hoverBg: 'hover:bg-red-50/60 dark:hover:bg-red-900/20',        headerGrad: 'from-red-500 to-rose-600',       headerIconBg: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  indigo:  { dot: 'bg-indigo-500',  activeBg: 'bg-indigo-50 dark:bg-indigo-900/30',   activeText: 'text-indigo-700 dark:text-indigo-300',  activeRing: 'ring-indigo-500/30',  hoverBg: 'hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20',  headerGrad: 'from-indigo-500 to-blue-600',    headerIconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
};

// Top-level view: the existing admin "All policies" inventory vs the role-scoped
// "For my role" view (G1). Defaults to 'all' so the accountadmin experience is
// unchanged; non-admins can switch to the role-scoped view that always works.
type ViewMode = 'all' | 'mine';

// Derive the best available masking type from Snowflake's semantic / privacy categories.
// Only maps to the types supported by MaskingPoliciesContent: FULL, PARTIAL_FIRST,
// PARTIAL_LAST, EMAIL, HASH, CUSTOM.
function inferMaskingType(semantic?: string | null, privacy?: string | null): string {
  const s = (semantic ?? '').toUpperCase();
  if (s.includes('EMAIL') || s.includes('MAIL'))                          return 'EMAIL';
  if (s.includes('SSN') || s.includes('SOCIAL_SECURITY') || s.includes('NATIONAL_ID')) return 'FULL';
  if (s.includes('PHONE') || s.includes('MOBILE') || s.includes('FAX'))  return 'FULL';
  if (s.includes('CREDIT_CARD') || s.includes('PAYMENT_CARD') || s.includes('CARD_NUMBER')) return 'PARTIAL_LAST';
  if (s.includes('IBAN') || s.includes('ACCOUNT_NUMBER') || s.includes('BANK_ACCOUNT')) return 'PARTIAL_LAST';
  if (s.includes('PASSPORT') || s.includes('DRIVER') || s.includes('LICENSE')) return 'FULL';
  if (s.includes('IP_ADDRESS') || s.includes('MAC_ADDRESS') || s.includes('DEVICE_ID')) return 'HASH';
  if (s.includes('USERNAME') || s.includes('USER_ID') || s.includes('PERSON_NAME')) return 'PARTIAL_FIRST';
  const p = (privacy ?? '').toUpperCase();
  if (p === 'IDENTIFIER')       return 'FULL';
  if (p === 'QUASI_IDENTIFIER') return 'PARTIAL_FIRST';
  if (p === 'SENSITIVE')        return 'HASH';
  return 'FULL'; // safe default
}

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState<TabType>('rls');
  const [view, setView] = useState<ViewMode>('all');
  // Docked metadata editor (right-tab) — open/closed; the policy type follows the
  // active tab so switching tabs while open re-targets the editor.
  const [metadataOpen, setMetadataOpen] = useState(false);
  // Prefill state for the masking create+apply forms, populated when the user clicks
  // "Protect" on a classified column in the Classification tab.
  // database/schema/table/column are optional — only present when the column came
  // from a classify result with a known target table.
  const [maskingPrefill, setMaskingPrefill] = useState<{
    name: string;
    maskingType: string;
    database?: string;
    schema?: string;
    table?: string;
    column?: string;
  } | null>(null);

  const handleProtect = useCallback((col: {
    column: string;
    semantic_category?: string | null;
    privacy_category?: string | null;
    database?: string;
    schema?: string;
    table?: string;
  }) => {
    setMaskingPrefill({
      name: `PROTECT_${col.column.toUpperCase()}`,
      maskingType: inferMaskingType(col.semantic_category, col.privacy_category),
      database: col.database || undefined,
      schema: col.schema || undefined,
      table: col.table || undefined,
      column: col.column || undefined,
    });
    setActiveTab('masking');
  }, []);

  const active = ALL_TABS.find((t) => t.id === activeTab)!;
  const accent = ACCENT_CLASSES[active.accent];
  const metadataType = TAB_TO_METADATA_TYPE[activeTab] ?? null;

  const Breadcrumb = () => (
    <nav className="mb-6">
      <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
        <Link href="/" className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Home</Link>
        <span>/</span>
        <Link href="/governance" className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Governance</Link>
        <span>/</span>
        <span className="text-slate-900 dark:text-slate-200 font-medium">Policies</span>
      </div>
    </nav>
  );

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <Breadcrumb />

        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl shadow-violet-500/25">
              <PiShieldCheck className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                Security Policies
              </h1>
              <p className="text-slate-600 dark:text-slate-400 text-base">
                Row-access, masking, classification, tags, data metrics, and more
              </p>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-4 text-right">
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{ALL_TABS.length}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Policy types</div>
            </div>
            <div className="h-10 w-px bg-slate-200 dark:bg-slate-700" />
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{GROUPS.length}</div>
              <div className="text-xs uppercase tracking-wide text-slate-500">Domains</div>
            </div>
          </div>
        </div>

        {/* Per-page KPI strip — real counts (masking · RLS · aggregation ·
            network · tags), honest "—" for any undetermined source. */}
        <GovernanceKpiStrip scope="policies" />

        {/* AI deep-link prefill (?intent=apply&from=scan). Renders nothing on a
            manual visit. useSearchParams() lives inside, wrapped in Suspense so
            the route doesn't deopt to fully client-side rendering at build. */}
        <Suspense fallback={null}>
          <ProposedPoliciesPanel />
        </Suspense>

        {/* View toggle: All policies (admin inventory) vs For my role (role-scoped, G1) */}
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800/60">
          {([
            { id: 'all' as ViewMode, label: 'All policies' },
            { id: 'mine' as ViewMode, label: 'For my role' },
          ]).map((v) => {
            const isActive = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={[
                  'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white text-violet-700 shadow-sm dark:bg-slate-900 dark:text-violet-300'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200',
                ].join(' ')}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        {view === 'mine' && <MyRolePoliciesContent />}

        {view === 'all' && (
          <>
        {/* Grouped tab bar + docked metadata editor (flex siblings, not a modal) */}
        <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-200/60 dark:border-slate-700/60 bg-gradient-to-b from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-900">
            <div className="flex flex-col gap-5">
              {GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-[140px] flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {group.label}
                    </span>
                    <span className="flex-1 h-px bg-slate-200 dark:bg-slate-700 sm:hidden" />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {group.tabs.map((tab) => {
                      const Icon = tab.icon;
                      const isActive = activeTab === tab.id;
                      const c = ACCENT_CLASSES[tab.accent];

                      return (
                        <button
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)}
                          title={tab.description}
                          className={[
                            'group relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-150',
                            'border',
                            isActive
                              ? `${c.activeBg} ${c.activeText} border-transparent ring-2 ${c.activeRing} shadow-sm`
                              : `border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 ${c.hoverBg}`,
                          ].join(' ')}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                          <Icon className="w-4 h-4" />
                          <span>{tab.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Active tab header strip */}
          <div className="px-4 sm:px-6 py-4 flex items-center gap-3 border-b border-slate-200/60 dark:border-slate-700/60">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent.headerIconBg}`}>
              <active.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white truncate">{active.name}</h2>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${accent.activeBg} ${accent.activeText}`}>
                  Active
                </span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 truncate">{active.description}</p>
            </div>
            {metadataType && (
              <button
                type="button"
                onClick={() => setMetadataOpen(true)}
                title="Edit a policy's expiration and comment in place"
                className="ml-auto shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <PiPencilSimple className="w-3.5 h-3.5" />
                Edit metadata
              </button>
            )}
          </div>

          {/* Tab content */}
          <div className="p-4 sm:p-6">
            {activeTab === 'rls' && <RLSPoliciesContent />}
            {activeTab === 'masking' && <MaskingPoliciesContent prefill={maskingPrefill} />}
            {activeTab === 'aggregation' && <AggregationPoliciesContent />}
            {activeTab === 'network' && <NetworkPoliciesContent />}
            {activeTab === 'tag' && <TagPoliciesContent />}
            {activeTab === 'password' && <PasswordPoliciesContent />}
            {activeTab === 'session' && <SessionPoliciesContent />}
            {activeTab === 'dmf' && <DMFContent />}
            {activeTab === 'classification' && <ClassificationContent onProtect={handleProtect} />}
          </div>
        </div>

          {/* Docked metadata editor — sibling of the card, not a modal. */}
          {metadataOpen && metadataType && (
            <PolicyMetadataPanel
              policyType={metadataType}
              policyTypeLabel={active.name}
              onClose={() => setMetadataOpen(false)}
            />
          )}
        </div>

        {/* Advisory governance-depth probes (read-only; self-disable if route not deployed) */}
        <GovernanceDepthPanel />

        {/* Classification & governance-tag inventory (paginated, filterable) */}
        <GovernanceTagsPanel />
          </>
        )}
      </div>
    </ErrorBoundary>
  );
}
