'use client';

/**
 * ServiceHealthPanel — surfaces previously-unwired backend observability into
 * the Administrator pages (no mocks, no restart): cache hit-rate + per-class
 * keys (/cache/kpis), service-account health (/admin/service-account/health),
 * the SVC registry (/admin/svc-registry) and the live cache event-bus stats
 * (/cache-stream/stats).
 */
import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  getCacheKpis, getServiceAccountHealth, getSvcRegistry, getCacheStreamStats,
  type CacheKpis, type ServiceAccountHealth, type SvcRegistry, type CacheStreamStats,
} from '@/app/services/cache/admin';
import { Loader2, Gauge, ServerCog, Radio, CheckCircle2, XCircle, Database, AlertTriangle, RefreshCw } from 'lucide-react';

export default function ServiceHealthPanel() {
  const [kpis, setKpis] = useState<CacheKpis | null>(null);
  const [svc, setSvc] = useState<ServiceAccountHealth | null>(null);
  const [reg, setReg] = useState<SvcRegistry | null>(null);
  const [stream, setStream] = useState<CacheStreamStats | null>(null);
  const [loading, setLoading] = useState(true);
  // True only when EVERY read failed — a single failed read degrades to "—" in place.
  const [allFailed, setAllFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAllFailed(false);
      const [k, s, r, st] = await Promise.allSettled([
        getCacheKpis(), getServiceAccountHealth(), getSvcRegistry(), getCacheStreamStats(),
      ]);
      if (cancelled) return;
      setKpis(k.status === 'fulfilled' ? k.value : null);
      setSvc(s.status === 'fulfilled' ? s.value : null);
      setReg(r.status === 'fulfilled' ? r.value : null);
      setStream(st.status === 'fulfilled' ? st.value : null);
      setAllFailed([k, s, r, st].every((x) => x.status === 'rejected'));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading service &amp; cache health…</div>;
  }

  if (allFailed) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Service &amp; cache health is unavailable right now.</span>
        <button
          type="button"
          onClick={() => setReloadKey((n) => n + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white/60 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-white dark:border-amber-500/40 dark:bg-transparent dark:text-amber-200"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cache + SVC KPI strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi icon={Gauge} label="Cache hit rate" value={kpis?.hit_rate != null ? `${kpis.hit_rate.toFixed(1)}%` : '—'} tone={kpis?.hit_rate != null && kpis.hit_rate >= 80 ? 'text-emerald-600' : 'text-amber-600'} />
        <Kpi icon={Database} label="Cached keys" value={kpis?.total_keys != null ? kpis.total_keys.toLocaleString() : '—'} />
        <Kpi icon={ServerCog} label="SVC active queries" value={svc?.active_queries != null ? svc.active_queries.toLocaleString() : '—'} />
        <Kpi icon={Radio} label="Stream subscribers" value={stream?.data?.active_subscribers ?? '—'} />
      </div>

      {/* SVC health line */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Service account</span>
        {svc ? (
          <>
            <Health ok={!!svc.connection_alive} label={svc.connection_alive ? 'connection alive' : 'connection down'} />
            <Health ok={!!svc.configured} label={svc.configured ? 'configured' : 'not configured'} />
            <Health ok={!svc.degraded} label={svc.degraded ? 'degraded' : 'healthy'} />
            {svc.role && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800">role: {svc.role}</span>}
          </>
        ) : (
          // No SVC read → "status unavailable", not a misleading red "down".
          <span className="text-[11px] text-slate-400">status unavailable —</span>
        )}
        {stream?.data?.tracked_cache_keys != null && <span className="text-[10px] text-slate-400">· {stream.data.tracked_cache_keys} tracked keys</span>}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* SVC registry */}
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">SVC registry ({reg?.total ?? reg?.accounts?.length ?? 0})</p>
          {(reg?.accounts || []).length === 0 ? <p className="text-xs text-slate-400">No service accounts registered.</p> : (
            <div className="space-y-1.5">
              {(reg!.accounts || []).map((a) => (
                <div key={a.account} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{a.account}</span>
                  <span className="text-slate-400">{a.user}</span>
                  <span className="text-[10px] text-slate-400">{a.auth_type}</span>
                  <Health ok={!!a.alive} label={a.alive ? 'alive' : 'down'} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cache by-class */}
        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Cache keys by class</p>
          {(kpis?.by_class || []).length === 0 ? <p className="text-xs text-slate-400">No keyed entries yet.</p> : (
            <div className="space-y-1">
              {(kpis!.by_class || []).slice(0, 8).map((c) => (
                <div key={c.class} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700 dark:text-slate-200">{c.class}</span>
                  <span className="font-mono text-[10px] text-slate-400">{c.prefix}</span>
                  <span className="tabular-nums text-slate-500">{c.keys ?? 0}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/60 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400"><Icon className="h-3 w-3" />{label}</div>
      <div className={cn('mt-1 text-lg font-semibold tabular-nums', tone || 'text-slate-900 dark:text-white')}>{value}</div>
    </div>
  );
}
function Health({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium', ok ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10')}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}{label}
    </span>
  );
}
