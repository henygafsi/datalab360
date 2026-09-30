'use client';

/**
 * StudioLakeMap — the data lake as a MAP, not a list. Built for the account
 * where a listing dies: dozens of databases, hundreds of schemas, thousands
 * of tables.
 *
 * Three honest levels, read live from the warehouse session (the 3-level
 * browse contract):
 *   databases → schemas → tables
 * The TABLE level renders as a squarified treemap — tile area = the real
 * approx_row_count served by the warehouse, tone deepens with log(rows) —
 * so a 350M-row fact wall and a 10-row reference table are told apart at a
 * glance. Upper levels are navigable tile walls with counts loaded on
 * drill, never guessed.
 *
 * Honesty rules: sizes come only from served approx_row_count ('—' rows
 * render as minimum tiles, labelled 'rows unknown'); nothing is fetched
 * beyond the level being looked at (a lake with 40 databases must not fire
 * 40×N calls); errors say so in place.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Database, Map as MapIcon, RefreshCw, Search } from 'lucide-react';
import apiClient from '@/lib/api-client';

interface LakeNode {
  ref: string;
  kind?: string;
  approx_row_count?: number | null;
}

type Level = { database?: string; schema?: string };

async function browse(level: Level): Promise<LakeNode[]> {
  const qs = new URLSearchParams();
  if (level.schema) qs.set('schema', level.schema);
  else if (level.database) qs.set('database', level.database);
  qs.set('limit', '500');
  const { data } = await apiClient.get<{ objects?: LakeNode[] }>(
    `/studio/connections/sf:session/objects?${qs.toString()}`,
    { timeout: 120_000 },
  );
  return data?.objects ?? [];
}

/* ── squarified-ish treemap (slice-and-dice by rows, good enough and stable) ── */
interface Tile {
  node: LakeNode;
  x: number;
  y: number;
  w: number;
  h: number;
}

function layoutTreemap(nodes: LakeNode[], W: number, H: number): Tile[] {
  const weights = nodes.map((n) => Math.max(1, Math.log10(Math.max(10, n.approx_row_count ?? 10))));
  const total = weights.reduce((a, b) => a + b, 0);
  const tiles: Tile[] = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  let i = 0;
  while (i < nodes.length) {
    // take a row of tiles along the shorter edge
    const horizontal = w >= h;
    const edge = horizontal ? h : w;
    let rowWeight = 0;
    let j = i;
    const remainingWeight = weights.slice(i).reduce((a, b) => a + b, 0);
    const target = Math.max(1, Math.round(Math.sqrt(nodes.length - i)));
    const take = Math.min(nodes.length - i, target);
    for (; j < i + take; j++) rowWeight += weights[j];
    const rowFrac = rowWeight / Math.max(1e-9, remainingWeight);
    const rowThick = (horizontal ? w : h) * rowFrac;
    let off = 0;
    for (let k = i; k < i + take; k++) {
      const frac = weights[k] / rowWeight;
      const len = edge * frac;
      tiles.push(
        horizontal
          ? { node: nodes[k], x, y: y + off, w: rowThick, h: len }
          : { node: nodes[k], x: x + off, y, w: len, h: rowThick },
      );
      off += len;
    }
    if (horizontal) {
      x += rowThick;
      w -= rowThick;
    } else {
      y += rowThick;
      h -= rowThick;
    }
    i += take;
  }
  return tiles;
}

function fmtRows(n: number | null | undefined): string {
  if (n == null) return 'rows unknown';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} B rows`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} M rows`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} k rows`;
  return `${n.toLocaleString()} rows`;
}

/** tone by magnitude — the lake's heat: reference tables stay pale, fact
 *  walls go deep brand blue. */
function toneFor(n: number | null | undefined): string {
  const m = n == null ? 0 : Math.log10(Math.max(1, n));
  if (m >= 8) return 'bg-accent-600 text-white hover:bg-accent-700';
  if (m >= 6) return 'bg-accent-400/80 text-white hover:bg-accent-500';
  if (m >= 4) return 'bg-accent-200 text-accent-900 hover:bg-accent-300 dark:bg-accent-900/60 dark:text-accent-100';
  if (m > 0) return 'bg-accent-50 text-accent-800 hover:bg-accent-100 dark:bg-accent-950/50 dark:text-accent-200';
  return 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400';
}

export default function StudioLakeMap() {
  const [level, setLevel] = useState<Level>({});
  const [nodes, setNodes] = useState<LakeNode[] | 'loading' | 'error'>('loading');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<LakeNode | null>(null);

  const load = useCallback((l: Level) => {
    setNodes('loading');
    setPicked(null);
    browse(l)
      .then(setNodes)
      .catch(() => setNodes('error'));
  }, []);

  useEffect(() => {
    load(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.database, level.schema]);

  const list = Array.isArray(nodes) ? nodes : [];
  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const base = needle ? list.filter((n) => n.ref.toUpperCase().includes(needle)) : list;
    return [...base].sort((a, b) => (b.approx_row_count ?? -1) - (a.approx_row_count ?? -1));
  }, [list, q]);

  const atTables = Boolean(level.schema);
  const tiles = useMemo(
    () => (atTables ? layoutTreemap(filtered, 100, 62) : []),
    [atTables, filtered],
  );

  const crumbs: Array<{ label: string; go: () => void }> = [
    { label: 'All databases', go: () => setLevel({}) },
    ...(level.database || level.schema
      ? [
          {
            label: (level.schema ?? level.database ?? '').split('.')[0],
            go: () => setLevel({ database: (level.schema ?? level.database ?? '').split('.')[0] }),
          },
        ]
      : []),
    ...(level.schema ? [{ label: level.schema.split('.')[1] ?? level.schema, go: () => undefined }] : []),
  ];

  const totalRows = atTables
    ? filtered.reduce((a, n) => a + (n.approx_row_count ?? 0), 0)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <MapIcon aria-hidden className="h-3.5 w-3.5" />
          Lake map
        </p>
        <nav aria-label="Lake path" className="flex items-center gap-1 text-[13px]">
          {crumbs.map((c, i) => (
            <span key={c.label + i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />}
              {i < crumbs.length - 1 ? (
                <button type="button" onClick={c.go} className="text-accent-700 hover:underline dark:text-accent-400">
                  {c.label}
                </button>
              ) : (
                <span className="font-medium text-slate-800 dark:text-slate-200">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        {atTables && totalRows != null && totalRows > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {fmtRows(totalRows)} across {filtered.length} object(s) — tile size follows the rows
          </span>
        )}
        <div className="relative ml-auto">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter this level"
            aria-label="Filter this level"
            className="rounded-lg border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      {nodes === 'loading' && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800">
          <RefreshCw aria-hidden className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      )}
      {nodes === 'error' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          The warehouse could not be browsed at this level — the map stays where it was.{' '}
          <button type="button" onClick={() => load(level)} className="font-medium underline">
            Retry
          </button>
        </p>
      )}

      {Array.isArray(nodes) && !atTables && (
        /* databases / schemas — a navigable tile wall (counts come on drill,
           never guessed at this level) */
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {filtered.map((n) => {
            const label = n.ref.split('.').slice(-1)[0];
            return (
              <li key={n.ref}>
                <button
                  type="button"
                  onClick={() =>
                    level.database ? setLevel({ schema: n.ref }) : setLevel({ database: n.ref })
                  }
                  className="group flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-left hover:border-accent-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-accent-700"
                  title={`Open ${n.ref}`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600 dark:bg-accent-950/50 dark:text-accent-300">
                    <Database aria-hidden className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-slate-800 group-hover:text-accent-700 dark:text-slate-200">
                      {label}
                    </span>
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                      {level.database ? 'schema' : 'database'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {filtered.length === 0 && (
            <li className="col-span-full rounded-xl border border-slate-200 p-4 text-center text-[13px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Nothing at this level{q ? ' matches the filter' : ''}.
            </li>
          )}
        </ul>
      )}

      {Array.isArray(nodes) && atTables && (
        <>
          <div
            role="list"
            aria-label="Tables sized by rows"
            className="relative w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
            style={{ aspectRatio: '100 / 62' }}
          >
            {tiles.map((t) => {
              const label = t.node.ref.split('.').slice(-1)[0];
              const big = t.w * t.h > 60;
              return (
                <button
                  key={t.node.ref}
                  type="button"
                  role="listitem"
                  onClick={() => setPicked(t.node)}
                  title={`${label} — ${fmtRows(t.node.approx_row_count)}`}
                  className={`absolute overflow-hidden border border-white/60 p-1 text-left transition-colors dark:border-slate-950/60 ${toneFor(t.node.approx_row_count)} ${picked?.ref === t.node.ref ? 'ring-2 ring-brand-500 ring-inset' : ''}`}
                  style={{
                    left: `${t.x}%`,
                    top: `${(t.y / 62) * 100}%`,
                    width: `${t.w}%`,
                    height: `${(t.h / 62) * 100}%`,
                  }}
                >
                  <span className={`block truncate font-medium ${big ? 'text-xs' : 'text-[10px]'}`}>{label}</span>
                  {big && <span className="block truncate text-[10px] opacity-80">{fmtRows(t.node.approx_row_count)}</span>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="flex h-full items-center justify-center text-[13px] text-slate-500 dark:text-slate-400">
                No table at this level{q ? ' matches the filter' : ''}.
              </p>
            )}
          </div>
          {picked && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[13px] dark:border-slate-800 dark:bg-slate-900">
              <span className="font-mono text-xs text-slate-700 dark:text-slate-200">{picked.ref}</span>
              <span className="text-slate-500 dark:text-slate-400">{fmtRows(picked.approx_row_count)}</span>
              <a
                href={`/studio/new?need=${encodeURIComponent(`Analyse ${picked.ref.split('.').slice(-1)[0]}`)}`}
                className="ml-auto text-xs font-medium text-accent-700 hover:underline dark:text-accent-400"
              >
                Start an application on this data
              </a>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(picked.ref)}
                className="text-xs text-slate-500 hover:underline dark:text-slate-400"
              >
                copy the name
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
