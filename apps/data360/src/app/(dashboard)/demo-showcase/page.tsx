'use client';

import Link from 'next/link';
import {
  LayoutDashboard,
  Database,
  Compass,
  GitBranch,
  Shield,
  BarChart3,
  Brain,
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Zap,
  Layers,
  Workflow,
  Lock,
  Globe,
  Server,
  Cpu,
  Snowflake,
  Cable,
  Box,
  FileCode2,
  Rocket,
  Target,
  TrendingUp,
  ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────
interface ModuleCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgGradient: string;
  href: string;
  features: string[];
  stats?: string;
}

interface RoadmapPhase {
  phase: string;
  title: string;
  status: 'done' | 'in-progress' | 'planned';
  items: string[];
}

interface Improvement {
  title: string;
  status: 'done' | 'in-progress' | 'planned';
  description: string;
}

// ─── Data ─────────────────────────────────────────────────────────────
const platformStats = [
  { label: 'Modules', value: '8+', icon: <Layers className="h-5 w-5" /> },
  { label: 'ETL Blocks', value: '28+', icon: <GitBranch className="h-5 w-5" /> },
  { label: 'Connectors', value: '7+', icon: <Cable className="h-5 w-5" /> },
  { label: 'Policy Types', value: '7', icon: <Shield className="h-5 w-5" /> },
  { label: 'DWH Tables', value: '13', icon: <Database className="h-5 w-5" /> },
  { label: 'AI Models', value: '5+', icon: <Brain className="h-5 w-5" /> },
];

const modules: ModuleCard[] = [
  {
    title: 'Command Center',
    description:
      'Unified analytics hub with 9 tabs covering KPIs, deployments, security, governance, costs, and infrastructure monitoring.',
    icon: <LayoutDashboard className="h-7 w-7" />,
    color: 'text-orange-500',
    bgGradient: 'from-orange-500/10 to-orange-600/5',
    href: '/account-overview',
    features: [
      '9 analytics tabs',
      'Observability radar chart',
      'Deployment approval workflow',
      'Cost & billing tracking',
      'Real-time activity feed',
    ],
    stats: '9 Tabs',
  },
  {
    title: 'Connect Data',
    description:
      'Multi-source data ingestion supporting cloud storage, databases, streaming, and data lake federation.',
    icon: <Cable className="h-7 w-7" />,
    color: 'text-blue-500',
    bgGradient: 'from-blue-500/10 to-blue-600/5',
    href: '/data-source-connection',
    features: [
      'AWS S3 & Azure Storage',
      'Databricks & Iceberg',
      'PostgreSQL & MySQL',
      'Snowflake Datalake browser',
      'Connection testing',
    ],
    stats: '7+ Sources',
  },
  {
    title: 'Explore & Design',
    description:
      'Visual data warehouse modeling with DWH template, ReactFlow canvas, event sourcing, and deployment pipeline.',
    icon: <Compass className="h-7 w-7" />,
    color: 'text-violet-500',
    bgGradient: 'from-violet-500/10 to-violet-600/5',
    href: '/explore-design',
    features: [
      'Pre-built DWH template (13 tables)',
      'ReactFlow modeling canvas',
      'Event-sourced audit trail',
      'Column mapping & masking',
      'Deployment validation',
    ],
    stats: '13 Tables',
  },
  {
    title: 'Workflow',
    description:
      'No-code DAG pipeline builder with 28+ reusable ETL blocks across Source, Transform, AI/ML, and Destination categories.',
    icon: <Workflow className="h-7 w-7" />,
    color: 'text-amber-500',
    bgGradient: 'from-amber-500/10 to-amber-600/5',
    href: '/workflow',
    features: [
      '28+ ETL block types',
      'Visual DAG builder',
      'SQL & Python scripts',
      'Deployment scheduling',
      'Version control & rollback',
    ],
    stats: '28+ Blocks',
  },
  {
    title: 'Governance',
    description:
      'Enterprise RBAC with 7 policy types, security matrix, audit trails, and comprehensive grant management.',
    icon: <Shield className="h-7 w-7" />,
    color: 'text-rose-500',
    bgGradient: 'from-rose-500/10 to-rose-600/5',
    href: '/governance/users',
    features: [
      'Users, Roles & Grants',
      '7 policy types (Masking, RLS, ...)',
      'Security matrix view',
      'Audit trail & history',
      'Project-based access',
    ],
    stats: '7 Policies',
  },
  {
    title: 'BI Dashboard',
    description:
      'Multi-page drag-and-drop dashboard builder with charts, KPI cards, and data tables for business reporting.',
    icon: <BarChart3 className="h-7 w-7" />,
    color: 'text-cyan-500',
    bgGradient: 'from-cyan-500/10 to-cyan-600/5',
    href: '/bi-dashboard',
    features: [
      'Multi-page dashboards',
      'Drag-drop widgets',
      'Charts, KPIs & tables',
      'Project-based reporting',
      'Real-time refresh (SSE)',
    ],
    stats: 'Drag & Drop',
  },
  {
    title: 'AI Intelligence',
    description:
      'Snowflake Cortex integration with natural language queries, semantic models, ML classification, and document AI.',
    icon: <Brain className="h-7 w-7" />,
    color: 'text-purple-500',
    bgGradient: 'from-purple-500/10 to-purple-600/5',
    href: '/intelligent',
    features: [
      'Cortex Chat (NL queries)',
      'YAML semantic models',
      'ML classification & fine-tuning',
      'Document AI extraction',
      'Sentiment & translation',
    ],
    stats: '5+ LLMs',
  },
  {
    title: 'Observability',
    description:
      'Platform-wide health monitoring with compliance reports, data lineage, KPI scoring, and trust center.',
    icon: <Activity className="h-7 w-7" />,
    color: 'text-emerald-500',
    bgGradient: 'from-emerald-500/10 to-emerald-600/5',
    href: '/observability',
    features: [
      'Health & governance scores',
      'GDPR & SOC2 compliance',
      'Data lineage visualization',
      'User activity analytics',
      'Trust center & findings',
    ],
    stats: 'Full Stack',
  },
];

const architectureFlow = [
  { label: 'Data Sources', icon: <Server className="h-5 w-5" />, color: 'bg-blue-500' },
  { label: 'Connect', icon: <Cable className="h-5 w-5" />, color: 'bg-blue-500' },
  { label: 'Explore & Design', icon: <Compass className="h-5 w-5" />, color: 'bg-violet-500' },
  { label: 'Workflow', icon: <Workflow className="h-5 w-5" />, color: 'bg-amber-500' },
  { label: 'Governance', icon: <Shield className="h-5 w-5" />, color: 'bg-rose-500' },
  { label: 'BI / AI', icon: <Brain className="h-5 w-5" />, color: 'bg-purple-500' },
  { label: 'Observability', icon: <Activity className="h-5 w-5" />, color: 'bg-emerald-500' },
];

const techStack = [
  { name: 'Next.js 14', icon: <FileCode2 className="h-4 w-4" /> },
  { name: 'Snowflake', icon: <Snowflake className="h-4 w-4" /> },
  { name: 'ReactFlow', icon: <GitBranch className="h-4 w-4" /> },
  { name: 'Jotai', icon: <Box className="h-4 w-4" /> },
  { name: 'Tailwind CSS', icon: <Layers className="h-4 w-4" /> },
  { name: 'Cortex AI', icon: <Cpu className="h-4 w-4" /> },
];

const roadmap: RoadmapPhase[] = [
  {
    phase: 'Phase 1',
    title: 'Core Platform',
    status: 'done',
    items: [
      'Command Center with 9 analytics tabs',
      'Multi-source data connectors (S3, Azure, Databricks, etc.)',
      'Explore & Design with DWH template & ReactFlow canvas',
      'Workflow builder with 28+ ETL blocks',
      'Governance (RBAC, 7 policy types, security matrix)',
      'BI Dashboard builder',
      'AI Intelligence (Cortex Chat, semantic models, ML)',
      'Data Health & Observability',
    ],
  },
  {
    phase: 'Phase 2',
    title: 'V2 Explore & Design Wizard',
    status: 'in-progress',
    items: [
      '6-step guided wizard (Source -> Schema -> Ingestion -> Masking -> Deploy -> Schedule)',
      'New API services (projectsApi, exploreDesignApi)',
      'Wizard state persistence (GET/PUT)',
      'Shared components (StatusBadge, ConfirmDialog, PaginatedTable)',
      'Route swap: replace legacy page with V2',
    ],
  },
  {
    phase: 'Phase 3',
    title: 'Advanced AI & Automation',
    status: 'planned',
    items: [
      'Advanced ML pipelines with Cortex fine-tuning',
      'Auto-generated ETL from schema analysis',
      'Intelligent data quality recommendations',
      'Cross-account analytics & federation',
    ],
  },
  {
    phase: 'Phase 4',
    title: 'Enterprise Scale',
    status: 'planned',
    items: [
      'Multi-tenant architecture',
      'Real-time collaboration (multi-user editing)',
      'Custom connector SDK',
      'Mobile-responsive dashboards',
      'Advanced data lineage & impact analysis',
    ],
  },
];

const improvements: Improvement[] = [
  {
    title: 'V2 Explore & Design Wizard',
    status: 'in-progress',
    description: '6-step guided wizard replacing the legacy monolithic page',
  },
  {
    title: 'Enhanced Cortex Integration',
    status: 'in-progress',
    description: 'Deeper AI capabilities with fine-tuning and document AI',
  },
  {
    title: 'SSE Cache Invalidation',
    status: 'done',
    description: 'Real-time cache refresh via Server-Sent Events',
  },
  {
    title: 'Deployment Approval Workflow',
    status: 'done',
    description: 'Multi-stage approval (draft -> review -> approve -> deploy)',
  },
  {
    title: 'Command Center (9 Tabs)',
    status: 'done',
    description: 'Unified analytics dashboard with KPIs, costs, security, and more',
  },
  {
    title: 'Real-time Collaboration',
    status: 'planned',
    description: 'Multi-user editing with presence indicators and conflict resolution',
  },
  {
    title: 'Advanced Data Lineage',
    status: 'planned',
    description: 'Visual dependency graph with impact analysis across pipelines',
  },
  {
    title: 'Custom Connector SDK',
    status: 'planned',
    description: 'Build and deploy custom data source connectors',
  },
  {
    title: 'Mobile-responsive Dashboards',
    status: 'planned',
    description: 'Optimized BI dashboards for tablet and mobile devices',
  },
];

// ─── Status Badge ─────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'done' | 'in-progress' | 'planned' }) {
  const config = {
    done: {
      bg: 'bg-emerald-100 dark:bg-emerald-900/30',
      text: 'text-emerald-700 dark:text-emerald-400',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      label: 'Done',
    },
    'in-progress': {
      bg: 'bg-amber-100 dark:bg-amber-900/30',
      text: 'text-amber-700 dark:text-amber-400',
      icon: <Clock className="h-3.5 w-3.5" />,
      label: 'In Progress',
    },
    planned: {
      bg: 'bg-blue-100 dark:bg-blue-900/30',
      text: 'text-blue-700 dark:text-blue-400',
      icon: <Target className="h-3.5 w-3.5" />,
      label: 'Planned',
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${c.bg} ${c.text}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

// ─── Section Header ───────────────────────────────────────────────────
function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
          {icon}
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h2>
      </div>
      {subtitle && (
        <p className="ml-[52px] text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      )}
    </div>
  );
}

// ─── Page Component ───────────────────────────────────────────────────
export default function DemoShowcasePage() {
  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-gray-950">
      {/* ── Hero Section ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-violet-50/50 to-transparent dark:from-blue-950/20 dark:via-violet-950/10 dark:to-transparent" />
        <div className="relative mx-auto max-w-7xl px-6 py-16 lg:py-20">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-100 dark:bg-blue-900/30 px-4 py-1.5 text-sm font-medium text-blue-700 dark:text-blue-400">
              <Snowflake className="h-4 w-4" />
              Built on Snowflake
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl">
              Data360{' '}
              <span className="bg-gradient-to-r from-blue-600 via-violet-600 to-purple-600 bg-clip-text text-transparent">
                Pro
              </span>
            </h1>
            <p className="mt-2 text-lg font-semibold text-gray-600 dark:text-gray-300">
              Scale Your Data Warehouse
            </p>
            <p className="mt-4 max-w-2xl text-base text-gray-500 dark:text-gray-400 leading-relaxed">
              A unified, enterprise-grade platform for data ingestion, warehouse modeling,
              ETL automation, AI intelligence, governance, and business reporting &mdash;
              all powered by Snowflake.
            </p>

            {/* Key Stats */}
            <div className="mt-10 grid grid-cols-3 gap-4 sm:grid-cols-6">
              {platformStats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex flex-col items-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 px-4 py-3 shadow-sm"
                >
                  <div className="text-gray-400 dark:text-gray-500 mb-1">{stat.icon}</div>
                  <div className="text-xl font-bold text-gray-900 dark:text-white">
                    {stat.value}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 py-12 space-y-16">
        {/* ── Modules Showcase ───────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Platform Modules"
            subtitle="8 integrated modules covering the entire data lifecycle"
            icon={<Layers className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
          />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((mod) => (
              <Link
                key={mod.title}
                href={mod.href}
                className="group relative flex flex-col rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm transition-all hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 hover:-translate-y-0.5"
              >
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${mod.bgGradient} opacity-0 transition-opacity group-hover:opacity-100`}
                />
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800 ${mod.color}`}
                    >
                      {mod.icon}
                    </div>
                    {mod.stats && (
                      <span className="text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 rounded-full px-2.5 py-1">
                        {mod.stats}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {mod.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                    {mod.description}
                  </p>
                  <ul className="space-y-1.5">
                    {mod.features.map((feat) => (
                      <li
                        key={feat}
                        className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
                    Open module <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* ── Architecture Flow ──────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Architecture Flow"
            subtitle="End-to-end data pipeline from ingestion to observability"
            icon={<GitBranch className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
          />
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 shadow-sm">
            {/* Flow diagram */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {architectureFlow.map((step, i) => (
                <div key={step.label} className="flex items-center gap-2 sm:gap-3">
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl ${step.color} text-white shadow-sm`}
                    >
                      {step.icon}
                    </div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400 text-center max-w-[80px]">
                      {step.label}
                    </span>
                  </div>
                  {i < architectureFlow.length - 1 && (
                    <ChevronRight className="h-5 w-5 text-gray-300 dark:text-gray-600 mt-[-20px]" />
                  )}
                </div>
              ))}
            </div>

            {/* Tech Stack */}
            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 text-center">
                Tech Stack
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {techStack.map((tech) => (
                  <span
                    key={tech.name}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    {tech.icon}
                    {tech.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Demo Flow ──────────────────────────────────────────── */}
        <section>
          <SectionHeader
            title="Demo Flow"
            subtitle="Recommended walkthrough for a 5-minute product demo"
            icon={<Rocket className="h-5 w-5 text-gray-600 dark:text-gray-300" />}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: 1,
                title: 'Command Center',
                desc: 'Overview tab: KPIs, radar chart, module health grid',
                href: '/account-overview',
                color: 'border-l-orange-500',
              },
              {
                step: 2,
                title: 'Connect Data',
                desc: 'Show S3 connector setup, datalake file browser',
                href: '/data-source-connection',
                color: 'border-l-blue-500',
              },
              {
                step: 3,
                title: 'Explore & Design',
                desc: 'Load DWH template, show modeling canvas with FK relationships',
                href: '/explore-design',
                color: 'border-l-violet-500',
              },
              {
                step: 4,
                title: 'Workflow',
                desc: 'Build ETL: Source -> Filter -> Aggregate -> Destination, then deploy',
                href: '/workflow',
                color: 'border-l-amber-500',
              },
              {
                step: 5,
                title: 'Governance',
                desc: 'Security matrix, masking policies, role-based grants',
                href: '/governance/security-matrix',
                color: 'border-l-rose-500',
              },
              {
                step: 6,
                title: 'AI Intelligence',
                desc: 'Ask Cortex Chat a natural language question, show semantic model',
                href: '/intelligent',
                color: 'border-l-purple-500',
              },
              {
                step: 7,
                title: 'BI Dashboard',
                desc: 'Create a quick chart from query results, show multi-page layout',
                href: '/bi-dashboard',
                color: 'border-l-cyan-500',
              },
              {
                step: 8,
                title: 'Observability',
                desc: 'Health scores, compliance reports, data lineage graph',
                href: '/observability',
                color: 'border-l-emerald-500',
              },
            ].map((item) => (
              <Link
                key={item.step}
                href={item.href}
                className={`group flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 border-l-4 ${item.color} bg-white dark:bg-gray-900 p-5 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-xs font-bold text-gray-600 dark:text-gray-300">
                    {item.step}
                  </span>
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                    {item.title}
                  </h4>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {item.desc}
                </p>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
                  Go <ArrowRight className="h-3 w-3" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
