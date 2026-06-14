'use client';

/**
 * AiAdvisor — "transform the scanned Snowflake data into Data360" advisor on the
 * Overview. Reads the real scan (object-enrichment: 243 objects, 0 linked to a
 * Data360 project/product) + recommendations, and proposes READY actions that
 * deep-link into the actual module pages (Explore & Design / Data Quality /
 * Governance / BI Dashboard / Workflow) with an `intent` so the target page can
 * prefill the action on arrival — not just navigate to another tab.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Boxes, ShieldCheck, Gauge, BarChart3, Workflow as WorkflowIcon, Sparkles, ArrowUpRight,
} from 'lucide-react';
import { getObjectEnrichment } from '@/app/services/command-center';
import { getCommandCenterRecommendations, type Recommendation } from '@/app/services/command-center/recommendations';

export default function AiAdvisor({ days = 30 }: { days?: number }) {
  const router = useRouter();
  const [unmigrated, setUnmigrated] = useState<number | null>(null);
  const [scanned, setScanned] = useState<number | null>(null);
  const [byDim, setByDim] = useState<Record<string, Recommendation[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.allSettled([getObjectEnrichment(days), getCommandCenterRecommendations(days)]).then(([e, r]) => {
      if (!active) return;
      if (e.status === 'fulfilled') {
        const rows: any[] = (e.value as any)?.data ?? [];
        setScanned(rows.length);
        setUnmigrated(rows.filter((x) => (x.projects || 0) === 0 && (x.products || 0) === 0).length);
      }
      if (r.status === 'fulfilled') setByDim((r.value as any)?.by_dimension ?? {});
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [days]);

  const top = (dim: string) => byDim[dim]?.[0]?.title;

  const actions = [
    {
      key: 'model', module: 'Explore & Design', icon: Boxes, tone: 'indigo',
      title: 'Modéliser les données scannées',
      msg: unmigrated != null
        ? `${unmigrated.toLocaleString()} table(s) Snowflake scannée(s) ne sont pas encore des produits Data360 — l’IA recommande de les modéliser.`
        : 'Modéliser les tables Snowflake détectées en produits Data360.',
      cta: 'Créer des produits', route: '/explore-design?intent=model&from=scan',
    },
    {
      key: 'dq', module: 'Data Quality', icon: Gauge, tone: 'blue',
      title: 'Activer le monitoring qualité',
      msg: top('dq') ?? 'Mettre en place le monitoring DQ (DMF) sur les tables sans mesures.',
      cta: 'Activer le DMF', route: '/data-quality?intent=enable-dmf&from=scan',
    },
    {
      key: 'gov', module: 'Governance', icon: ShieldCheck, tone: 'violet',
      title: 'Gouverner & cataloguer',
      msg: top('gov') ?? 'Appliquer des policies (masquage / MFA) sur les objets sensibles détectés.',
      cta: 'Appliquer une policy', route: '/governance/policies?intent=apply&from=scan',
    },
    {
      key: 'bi', module: 'BI Dashboard', icon: BarChart3, tone: 'emerald',
      title: 'Analyser les données métier',
      msg: 'Publier les datasets fonctionnels détectés en dashboards BI pour l’analyse business.',
      cta: 'Créer un dashboard', route: '/bi-dashboard?intent=publish&from=scan',
    },
    {
      key: 'flow', module: 'Workflow', icon: WorkflowIcon, tone: 'amber',
      title: 'Automatiser les pipelines',
      msg: top('cost') ?? top('perf') ?? 'Automatiser l’ingestion / l’optimisation des données via un workflow.',
      cta: 'Créer un workflow', route: '/workflow?intent=create&from=scan',
    },
  ];

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/50 to-white p-4 dark:border-violet-900/40 dark:from-violet-950/20 dark:to-gray-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" />
        </span>
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          Conseiller IA — transformer les données Snowflake scannées en Data360
        </h3>
        {scanned != null && (
          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
            {scanned.toLocaleString()} objets scannés
          </span>
        )}
        <span className="text-[11px] text-gray-400">Actions prêtes à exécuter dans les modules</span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {actions.map((a) => (
          <div key={a.key} className={`flex flex-col rounded-xl border border-${a.tone}-200 bg-white p-3 dark:border-${a.tone}-900/40 dark:bg-gray-900`}>
            <div className="mb-1 flex items-center gap-1.5">
              <a.icon className={`h-3.5 w-3.5 text-${a.tone}-600 dark:text-${a.tone}-400`} />
              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{a.title}</span>
              <span className={`ml-auto rounded bg-${a.tone}-50 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-${a.tone}-600 dark:bg-${a.tone}-900/30 dark:text-${a.tone}-300`}>
                {a.module}
              </span>
            </div>
            <p className="min-h-[32px] flex-1 text-[11px] leading-snug text-gray-600 dark:text-gray-300">
              {loading ? 'Analyse IA…' : a.msg}
            </p>
            <button
              onClick={() => router.push(a.route)}
              className={`mt-2 inline-flex items-center justify-center gap-1 rounded-lg bg-${a.tone}-600 px-2.5 py-1 text-[11px] font-medium text-white transition-colors hover:bg-${a.tone}-700`}
            >
              {a.cta} <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
