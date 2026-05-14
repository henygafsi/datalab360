'use client';

import { useState, useEffect, memo } from 'react';
import { Badge, Loader } from 'rizzui';
import {
  Database,
  GitBranch,
  BarChart3,
  Shield,
  Brain,
  CheckCircle,
  Eye,
  Upload,
  Activity,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import Link from 'next/link';
import { getModuleHealth, getSummary } from '@/app/services/command-center';

interface ModuleCard {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
  href: string;
  kpis: { label: string; value: string | number }[];
  status: 'healthy' | 'degraded' | 'inactive';
}

const STATUS_BADGE: Record<string, string> = {
  healthy:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  degraded:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
};

function buildModuleCards(moduleHealth: any, _summary: any): ModuleCard[] {
  // Backend returns modules as array — convert to cards directly
  const rawModules = Array.isArray(moduleHealth?.modules)
    ? moduleHealth.modules
    : [];

  const ICON_MAP: Record<string, React.ElementType> = {
    connect: Upload,
    workflow: GitBranch,
    explore_design: Database,
    bi_reporting: BarChart3,
    data_quality: CheckCircle,
    cortex: Brain,
    governance: Shield,
    observability: Eye,
  };
  const COLOR_MAP: Record<string, string> = {
    connect: 'blue',
    workflow: 'amber',
    explore_design: 'violet',
    bi_reporting: 'cyan',
    data_quality: 'green',
    cortex: 'purple',
    governance: 'rose',
    observability: 'orange',
  };
  const HREF_MAP: Record<string, string> = {
    connect: '/data-source-connection',
    workflow: '/workflow',
    explore_design: '/explore-design',
    bi_reporting: '/bi-dashboard',
    data_quality: '/data-quality',
    cortex: '/intelligent',
    governance: '/governance',
    observability: '/observability',
  };

  return rawModules.map((m: any) => ({
    id: m.module_key,
    name: m.module,
    icon: ICON_MAP[m.module_key] || Activity,
    color: COLOR_MAP[m.module_key] || 'gray',
    href: HREF_MAP[m.module_key] || '/',
    status: m.status || 'inactive',
    kpis: [
      { label: m.kpi1_label || 'KPI 1', value: m.kpi1 ?? 0 },
      { label: m.kpi2_label || 'KPI 2', value: m.kpi2 ?? 0 },
      { label: m.kpi3_label || 'KPI 3', value: m.kpi3 ?? 0 },
    ],
  }));
}

function ModulesTab() {
  const [loading, setLoading] = useState(true);
  const [moduleCards, setModuleCards] = useState<ModuleCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [health, summary] = await Promise.all([
          getModuleHealth(),
          getSummary(),
        ]);
        setModuleCards(buildModuleCards(health, summary));
      } catch (err: any) {
        setError(err?.message || 'Failed to load module health');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
        {error}
      </div>
    );
  }

  // Top-strip KPIs derived from cards array (see Screens/Account-overview/04-modules/_features.md).
  const totalModules = moduleCards.length;
  const healthyCount = moduleCards.filter((m) => m.status === 'healthy').length;
  const degradedCount = moduleCards.filter(
    (m) => m.status === 'degraded'
  ).length;
  const inactiveCount = moduleCards.filter(
    (m) => m.status === 'inactive'
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          Module Health Overview
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Real-time KPIs for each Data360 module. Click a module to navigate to
          its dashboard.
        </p>
      </div>

      {/* Top-strip KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Modules enabled
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {totalModules}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Healthy</p>
          <p className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">
            {healthyCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Degraded</p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">
            {degradedCount}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <p className="text-xs text-gray-500 dark:text-gray-400">Inactive</p>
          <p className="mt-1 text-2xl font-bold text-gray-500 dark:text-gray-400">
            {inactiveCount}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {moduleCards.map((mod) => {
          const Icon = mod.icon;
          return (
            <Link
              key={mod.id}
              href={mod.href}
              className={`group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-900 hover:border-${mod.color}-300 dark:hover:border-${mod.color}-700`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`h-10 w-10 rounded-lg bg-${mod.color}-100 dark:bg-${mod.color}-900/30 flex items-center justify-center`}
                  >
                    <Icon
                      className={`h-5 w-5 text-${mod.color}-600 dark:text-${mod.color}-400`}
                    />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {mod.name}
                    </h3>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge
                        className={`${STATUS_BADGE[mod.status]} text-[10px]`}
                      >
                        {mod.status}
                      </Badge>
                      {mod.status === 'healthy' && (
                        <TrendingUp className="h-3 w-3 text-green-500" />
                      )}
                      {mod.status === 'degraded' && (
                        <TrendingDown className="h-3 w-3 text-amber-500" />
                      )}
                      {mod.status === 'inactive' && (
                        <Minus className="h-3 w-3 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-400" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {mod.kpis.map((kpi) => (
                  <div key={kpi.label} className="text-center">
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {typeof kpi.value === 'number'
                        ? kpi.value.toLocaleString()
                        : kpi.value}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {kpi.label}
                    </p>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default memo(ModulesTab);
