'use client';

/**
 * StudioViewKpis — the business-KPI strip for a Studio view, fed by the
 * served `summary` roll-up (one fetch per view). Mount it above a view's
 * content; it renders `StudioKpiHeader`, so an unevaluated figure shows "—"
 * (never an invented 0/100) and every figure is a real served number.
 *
 * Model has its own strip inside StudioModelTab; this covers the panels that
 * are single components (Sources, Access, …).
 */

import { useEffect, useState } from 'react';
import {
  Boxes,
  Database,
  Fingerprint,
  Filter,
  Gauge,
  KeyRound,
  Layers,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UserRound,
  Users,
} from 'lucide-react';
import {
  getStudioSummary,
  type AccessSummary,
  type SourcesSummary,
  type SummaryView,
} from '@/app/services/studio/summary';
import StudioKpiHeader, { type Kpi } from '@/app/shared/studio/StudioKpiHeader';

function riskTone(r?: string | null): Kpi['tone'] {
  if (r === 'low') return 'good';
  if (r === 'medium') return 'warn';
  if (r === 'high') return 'bad';
  return 'default';
}
function pctTone(p?: number | null): Kpi['tone'] {
  if (p == null) return 'default';
  return p >= 85 ? 'good' : p >= 60 ? 'warn' : 'bad';
}

function sourcesKpis(s: SourcesSummary): Kpi[] {
  return [
    { key: 'systems', label: 'Connected systems', value: s.connected_systems ?? null, icon: Database },
    { key: 'domains', label: 'Functional domains', value: s.functional_domains_detected ?? null, icon: Boxes, sub: 'detected by AI' },
    { key: 'objects', label: 'Active objects', value: s.objects ?? null, icon: Layers },
    { key: 'rows', label: 'Rows scanned', value: s.rows_scanned ?? null, icon: ScanLine },
    { key: 'fresh', label: 'Freshness (avg)', value: s.freshness_avg_days ?? null, unit: s.freshness_avg_days == null ? undefined : ' d', icon: Timer },
    { key: 'health', label: 'Source health score', value: s.source_health_score ?? null, icon: Gauge, tone: pctTone(s.source_health_score) },
  ];
}

function accessKpis(a: AccessSummary): Kpi[] {
  return [
    { key: 'people', label: 'People with access', value: a.people ?? null, icon: Users },
    { key: 'roles', label: 'App roles', value: a.app_roles ?? null, icon: UserRound },
    { key: 'datasets', label: 'Governed datasets', value: a.governed_datasets ?? null, icon: Database },
    { key: 'rls', label: 'Active RLS rules', value: a.active_rls ?? null, icon: Filter },
    { key: 'masked', label: 'Masked columns', value: a.masked_columns ?? null, icon: ShieldCheck },
    { key: 'encrypted', label: 'Encrypted columns', value: a.encrypted_columns ?? null, icon: KeyRound },
    {
      key: 'approvals',
      label: 'Pending approvals',
      value: a.pending_count ?? null,
      icon: Fingerprint,
      tone: (a.pending_count ?? 0) > 0 ? 'warn' : 'default',
    },
    {
      key: 'risk',
      label: 'Risk level',
      value: a.risk_level ?? null,
      icon: ShieldAlert,
      tone: riskTone(a.risk_level),
      sub: (a.risk_reasons ?? [])[0],
    },
  ];
}

export default function StudioViewKpis({ draftId, view }: { draftId: string; view: SummaryView }) {
  const [kpis, setKpis] = useState<Kpi[] | null>(null);

  useEffect(() => {
    let alive = true;
    setKpis(null);
    void getStudioSummary(draftId, [view])
      .then((r) => {
        if (!alive) return;
        if (view === 'sources') setKpis(sourcesKpis(r.sources ?? {}));
        else if (view === 'access') setKpis(accessKpis(r.access ?? {}));
        else setKpis([]);
      })
      .catch(() => alive && setKpis([]));
    return () => {
      alive = false;
    };
  }, [draftId, view]);

  if (kpis !== null && kpis.length === 0) return null;
  return <StudioKpiHeader kpis={kpis ?? []} loading={kpis === null} />;
}
