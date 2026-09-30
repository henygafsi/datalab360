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

import { useCallback, useEffect, useState } from 'react';
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
  type JobsSummary,
  type SourcesSummary,
  type StudioSummary,
  type SummaryView,
} from '@/app/services/studio/summary';
import { useAccessChanged } from '@/app/services/studio/studio-bus';
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

/** The access strip reads three truths apart — what is APPLIED (really in
 *  force), what is STAGED (prepared, not applied), and the FOOTPRINT (what the
 *  app reads: the honest denominator). The headline value is the APPLIED
 *  figure — so a plan that is prepared but not applied does not read as done —
 *  with staged/footprint in the sub-line. This is the fix for "the numbers are
 *  wrong": flat 0s that ignored a 4-dataset / 59-column footprint. Falls back
 *  to the flat keys only when an older backend omits the nested blocks. */
function accessKpis(a: AccessSummary): Kpi[] {
  const ap = a.applied ?? {};
  const st = a.staged ?? {};
  const fp = a.footprint ?? {};
  const method = a.kpi_method ?? null;
  const pick = (nested: number | null | undefined, flat: number | null | undefined): number | null =>
    nested ?? flat ?? null;
  const stagedSub = (n?: number | null): string | undefined => (n && n > 0 ? `${n} staged` : undefined);
  const maskedApplied = pick(ap.masked_columns, a.masked_columns);
  return [
    { key: 'people', label: 'People with access', value: pick(ap.people, a.people), icon: Users, method, sub: stagedSub(st.people) },
    { key: 'roles', label: 'App roles', value: pick(ap.app_roles, a.app_roles), icon: UserRound, method, sub: stagedSub(st.roles) },
    {
      key: 'datasets',
      label: 'Governed datasets',
      value: pick(ap.governed_datasets, a.governed_datasets),
      icon: Database,
      method,
      sub:
        fp.datasets != null
          ? `of ${fp.datasets} in footprint${st.datasets ? ` · ${st.datasets} staged` : ''}`
          : stagedSub(st.datasets),
    },
    { key: 'rls', label: 'Active RLS rules', value: pick(ap.rls_rules, a.active_rls), icon: Filter, method, sub: stagedSub(st.rls_rules) },
    {
      key: 'masked',
      label: 'Masked columns',
      value: maskedApplied,
      icon: ShieldCheck,
      method,
      // PII confirmed but nothing masked yet = a real compliance gap, flagged
      tone: (fp.pii_columns_confirmed ?? 0) > 0 && (maskedApplied ?? 0) === 0 ? 'warn' : 'default',
      sub:
        fp.pii_columns_confirmed
          ? `${fp.pii_columns_confirmed} PII confirmed`
          : stagedSub(st.masked_columns),
    },
    { key: 'encrypted', label: 'Encrypted columns', value: pick(ap.encrypted_columns, a.encrypted_columns), icon: KeyRound, method, sub: stagedSub(st.encrypted_columns) },
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

function jobsKpis(j: JobsSummary): Kpi[] {
  const jobs = j.jobs ?? [];
  const byStage = j.by_stage ?? {};
  const byType = j.by_data_type ?? {};
  const stageTotal = Object.values(byStage).reduce((a, b) => a + (b ?? 0), 0);
  const total = jobs.length > 0 ? jobs.length : stageTotal || null;
  const dlq = jobs.reduce((a, x) => a + (x.dlq_open ?? 0), 0);

  /* An application with NO transformations yet was rendering six tiles that said
   * "— 0 0 0 — —": half em-dashes, half zeros, for the same fact. Two problems in
   * one strip. It contradicted itself (Jobs "—" beside Source loads "0" — if there
   * are no jobs there are not zero loads, there are no loads), and it spent the
   * whole top of the page saying nothing, pushing the one thing the reader should
   * do — propose the target model — below six empty boxes.
   * A measure strip has to earn its space: with nothing to count, it does not
   * render at all (the caller drops an empty list) and the call to action is the
   * first thing on the page. Once a single job exists, 0 becomes a real
   * measurement and every tile returns. */
  const nothingYet =
    total == null && stageTotal === 0 && dlq === 0 && j.credits_reconciled_total == null;
  if (nothingYet) return [];

  return [
    { key: 'total', label: 'Jobs', value: total, icon: Boxes },
    { key: 'source', label: 'Source loads', value: byStage.source_loads ?? null, icon: Database },
    { key: 'facts', label: 'Fact builds', value: byStage.facts ?? null, icon: Layers },
    { key: 'event', label: 'Event-type jobs', value: byType.event ?? null, icon: ScanLine, sub: 'transactional / cdc' },
    { key: 'dlq', label: 'DLQ backlog', value: total == null ? null : dlq, icon: ShieldAlert, tone: dlq > 0 ? 'warn' : 'default' },
    { key: 'cost', label: 'Credits (reconciled)', value: j.credits_reconciled_total ?? null, icon: Gauge, sub: 'from query history' },
  ];
}

export default function StudioViewKpis({ draftId, view }: { draftId: string; view: SummaryView }) {
  const [kpis, setKpis] = useState<Kpi[] | null>(null);

  const build = useCallback(
    (r: StudioSummary): Kpi[] => {
      if (view === 'sources') return sourcesKpis(r.sources ?? {});
      if (view === 'access') return accessKpis(r.access ?? {});
      if (view === 'jobs') return jobsKpis(r.jobs ?? {});
      return [];
    },
    [view],
  );

  const load = useCallback(
    async (soft = false) => {
      // a soft reload (after an access apply) keeps the current figures on
      // screen while the fresh ones arrive — no flash back to skeletons.
      if (!soft) setKpis(null);
      try {
        setKpis(build(await getStudioSummary(draftId, [view])));
      } catch {
        // never silently blank the strip: keep the last figures when we have
        // them, otherwise render the shell (every value "—") so the strip and
        // its labels stay put instead of vanishing on a transient error.
        setKpis((prev) => (prev && prev.length ? prev : build({})));
      }
    },
    [draftId, view, build],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Re-read after an APPLIED access change so the counts stop reading stale 0s
  // (the "counts stuck" the user photographed). Only the access strip cares.
  const softReload = useCallback(() => {
    void load(true);
  }, [load]);
  useAccessChanged(view === 'access' ? draftId : null, softReload);

  if (kpis !== null && kpis.length === 0) return null;
  return <StudioKpiHeader kpis={kpis ?? []} loading={kpis === null} />;
}
