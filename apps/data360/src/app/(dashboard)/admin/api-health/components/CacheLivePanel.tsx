'use client';
/**
 * CacheLivePanel — compact LIVE cache signal for the Functional API View.
 *
 * Sources (both already wired backend routes):
 *   GET /cache/stats     → { cache_stats: { hits, misses, hit_rate, total_requests }, cache_keys }
 *   GET /cache/breakdown → { by_class: [{ class, prefix, count }], total }
 *
 * Honesty rules: every number is real or "—" (never a fabricated 0 for a
 * missing field); the per-class list is labeled as CLASS PREFIXES AS REPORTED
 * BY THE BACKEND — we do not re-bucket or invent classes client-side.
 */
import { useCallback, useEffect, useState } from 'react';
import { getCacheStats, getCacheBreakdown, type CacheStats, type CacheBreakdown } from '@/app/services/cache';
import { toMessage } from '@/lib/error-messages';

const fmt = (n: number | null | undefined): string => (n == null ? '—' : String(n));

export default function CacheLivePanel() {
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [breakdown, setBreakdown] = useState<CacheBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showClasses, setShowClasses] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    // The two reads are independent — a failure on one must not blank the other.
    const [s, b] = await Promise.allSettled([getCacheStats(), getCacheBreakdown()]);
    if (s.status === 'fulfilled') setStats(s.value); else setErr(toMessage(s.reason, 'Stats cache indisponibles.'));
    if (b.status === 'fulfilled') setBreakdown(b.value);
    else if (s.status === 'fulfilled') setErr(toMessage(b.reason, 'Répartition cache indisponible.'));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cs = stats?.cache_stats ?? null;
  const hitRate = cs?.hit_rate; // percentage 0–100, backend-computed
  const rateColor = hitRate == null ? '#6b7280' : hitRate >= 70 ? '#15803d' : hitRate >= 40 ? '#d97706' : '#dc2626';

  return (
    <div style={{
      border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 12px', background: '#fafafa',
      fontSize: 11.5, color: '#4b5563', minWidth: 230, maxWidth: 330,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, color: '#374151' }}>Cache (live)</span>
        <button
          onClick={() => void load()}
          disabled={loading}
          title="Relire /cache/stats + /cache/breakdown"
          style={{ marginLeft: 'auto', fontSize: 11, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#374151', padding: '1px 7px', cursor: loading ? 'wait' : 'pointer' }}
        >
          {loading ? '…' : '⟳'}
        </button>
      </div>
      {err && <div style={{ color: '#b45309', marginTop: 4 }}>{err}</div>}
      {!err && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 4 }}>
            <span title="Taux de hit rapporté par le backend (hits / requêtes)" style={{ fontSize: 20, fontWeight: 700, color: rateColor }}>
              {hitRate == null ? '—' : `${Math.round(hitRate * 10) / 10}%`}
            </span>
            <span>de hits</span>
            <span style={{ color: '#9ca3af' }} title="hits / miss / total des requêtes cache">
              {fmt(cs?.hits)} hit · {fmt(cs?.misses)} miss · {fmt(cs?.total_requests)} req
            </span>
          </div>
          <div style={{ marginTop: 2, color: '#9ca3af' }}>
            {fmt(stats?.cache_keys?.total_keys)} clés en cache
            {breakdown ? ` · ${fmt(breakdown.total)} clés classées` : ''}
            {breakdown && breakdown.by_class.length > 0 && (
              <button
                onClick={() => setShowClasses((v) => !v)}
                style={{ marginLeft: 6, fontSize: 10.5, background: 'none', border: 'none', color: '#6d28d9', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                {showClasses ? 'masquer les classes' : 'par classe'}
              </button>
            )}
          </div>
          {showClasses && breakdown && (
            <div style={{ marginTop: 6, borderTop: '1px dashed #e5e7eb', paddingTop: 6 }}>
              {breakdown.by_class.map((c) => (
                <div key={c.class} style={{ display: 'flex', gap: 6, alignItems: 'baseline', lineHeight: 1.7 }}>
                  <span style={{ color: '#374151', fontWeight: 600 }}>{c.class}</span>
                  <code style={{ background: '#f3f4f6', borderRadius: 4, padding: '0 4px', fontSize: 10 }}>{c.prefix}</code>
                  <span style={{ marginLeft: 'auto' }}>{fmt(c.count)}</span>
                </div>
              ))}
              <div style={{ marginTop: 4, fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
                Préfixes de classes tels que rapportés par le backend — aucun regroupement côté client.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
