'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getBlockByType } from './etl-blocks';
import { BLOCK_BY_TYPE, type CatalogParam } from './etl-catalog-grounding';

export interface BigPictureUpstream {
  id: string;
  label: string;
  type?: string;
}

export interface NodeBigPicturePopoverProps {
  nodeId: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
  upstream: BigPictureUpstream[];
  downstream: BigPictureUpstream[];
  compiledSnippet?: string;
  /**
   * Opens the full config sidebar. Best-effort: a `field` may be passed to
   * focus a specific param in the sidebar. Callers that don't support
   * field-focus may simply ignore the argument.
   */
  onOpenConfig?: (field?: string) => void;
}

interface VariableRow {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  defaultValue?: unknown;
  rawValue: unknown;
  filled: boolean;
  /** Sort bucket: 0=req-empty, 1=req-filled, 2=opt-filled, 3=opt-empty */
  bucket: 0 | 1 | 2 | 3;
}

const RESERVED_CONFIG_KEYS = new Set<string>([
  'inputs', 'cte_alias', 'position', 'nodeId', 'name', 'step_order', 'stepIndex',
]);

const isFilled = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
};

const truncate = (s: string, n: number): string =>
  s.length > n ? s.slice(0, n - 1) + '…' : s;

/**
 * Returns a per-block-type fallback SQL/Python template, used when the workflow
 * has not yet been compiled. Mirrors the shape of the real CTE that the backend
 * would produce.
 */
const getBlockTemplate = (type: string, config: Record<string, unknown>): string => {
  const cfg = (key: string): string => {
    const v = config[key];
    if (v === null || v === undefined || v === '') return `<${key}>`;
    if (Array.isArray(v)) return v.join(', ') || `<${key}>`;
    return String(v);
  };
  switch (type) {
    case 'source':
    case 'src':
      return `SELECT *\nFROM ${cfg('database')}.${cfg('schema')}.${cfg('table')}`;
    case 'filter':
      return `SELECT *\nFROM <upstream>\nWHERE ${cfg('filter_condition')}`;
    case 'aggregate':
      return `SELECT ${cfg('group_by')},\n       <aggregations>\nFROM <upstream>\nGROUP BY ${cfg('group_by')}`;
    case 'join':
      return `SELECT *\nFROM <left> L\n${cfg('join_type')} JOIN <right> R\n  ON L.${cfg('left_key')} = R.${cfg('right_key')}`;
    case 'select':
      return `SELECT ${cfg('columns')}\nFROM <upstream>`;
    case 'rename':
      return `SELECT <renamed_columns>\nFROM <upstream>`;
    case 'sort':
      return `SELECT *\nFROM <upstream>\nORDER BY ${cfg('order_by')}`;
    case 'distinct':
      return `SELECT DISTINCT *\nFROM <upstream>`;
    case 'limit':
      return `SELECT *\nFROM <upstream>\nLIMIT ${cfg('limit')}`;
    case 'union':
      return `SELECT * FROM <input_a>\nUNION ALL\nSELECT * FROM <input_b>`;
    case 'destination':
      return `${cfg('write_mode') || 'INSERT'} INTO ${cfg('database')}.${cfg('schema')}.${cfg('table')}\nSELECT * FROM <upstream>`;
    default:
      return `-- ${type} block\n-- compiled snippet appears here after Save -> Validate -> SQL`;
  }
};

const TYPE_CHIP_PALETTE: Record<string, string> = {
  string: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  number: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  boolean: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  array: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  object: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  null: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const inferType = (value: unknown): string => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value
      .map((v) => (typeof v === 'object' ? JSON.stringify(v) : String(v)))
      .join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * Click-triggered popover anchored to a node header. Shows:
 *  - Block type + label, "Reads from N · Writes to M" subline
 *  - "Variables in scope" table (key, value, type)
 *  - "Compiled snippet" pre — uses real compiledSnippet if provided,
 *    else the per-type template above.
 *  - "Open full config" footer that triggers the parent's onNodeClick.
 *
 * Traps focus, closes on Esc + click-outside.
 */
const NodeBigPicturePopover: React.FC<NodeBigPicturePopoverProps> = ({
  nodeId: _nodeId,
  type,
  label,
  config,
  upstream,
  downstream,
  compiledSnippet,
  onOpenConfig,
}) => {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const firstFocusableRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => setOpen(false), []);

  // Click-outside + Escape handlers
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current && !popoverRef.current.contains(target) && !buttonRef.current?.contains(target)) {
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    // Move initial focus into the popover (focus trap entry)
    setTimeout(() => firstFocusableRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open, close]);

  const block = getBlockByType(type);
  const blockLabel = block?.label ?? type;

  // Pick the snippet — real compiled CTE if present, else fallback template
  const rawSnippet = (compiledSnippet && compiledSnippet.trim().length > 0)
    ? compiledSnippet
    : getBlockTemplate(type, config);
  const snippetLines = rawSnippet.split('\n').slice(0, 6);
  const snippet = snippetLines.join('\n');

  // Resolve catalog entry (may be absent for orphan/legacy blocks)
  const catalogBlock = BLOCK_BY_TYPE.get(type);
  const catalogParams: CatalogParam[] = useMemo(
    () => catalogBlock?.params ?? [],
    [catalogBlock],
  );

  // Build semantic rows: one per catalog param, ordered by required-empty first.
  const variableRows = useMemo<VariableRow[]>(() => {
    const cfg = config || {};
    const rows: VariableRow[] = catalogParams.map((p) => {
      const raw = cfg[p.name];
      const filled = isFilled(raw);
      const bucket: VariableRow['bucket'] = p.required
        ? (filled ? 1 : 0)
        : (filled ? 2 : 3);
      return {
        name: p.name,
        type: p.type,
        required: p.required,
        description: p.description,
        defaultValue: p.default,
        rawValue: raw,
        filled,
        bucket,
      };
    });
    return rows.sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      return a.name.localeCompare(b.name);
    });
  }, [catalogParams, config]);

  // "Extra variables" — keys in data.config not declared by the catalog.
  const extraVariableKeys = useMemo<string[]>(() => {
    const declared = new Set(catalogParams.map((p) => p.name));
    return Object.keys(config || {})
      .filter((k) => !k.startsWith('_'))
      .filter((k) => !RESERVED_CONFIG_KEYS.has(k))
      .filter((k) => !declared.has(k));
  }, [catalogParams, config]);

  // Legacy fallback rows (no catalog match) — preserve the old "dump keys" view.
  const fallbackEntries = Object.entries(config || {})
    .filter(([k]) => !k.startsWith('_'))
    .filter(([k]) => !RESERVED_CONFIG_KEYS.has(k))
    .filter(([, v]) => isFilled(v));

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          'p-0.5 rounded hover:bg-white/40 dark:hover:bg-slate-700/40 transition-colors',
          'text-slate-500 dark:text-slate-400',
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Show what this block does"
        title="Show what this block does"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`${blockLabel} — big picture`}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'absolute right-0 top-full mt-1 z-50',
            'w-[340px] max-h-[460px] overflow-auto',
            'bg-white dark:bg-slate-800 rounded-lg shadow-xl',
            'border border-slate-200 dark:border-slate-700',
            'p-3 text-xs text-slate-700 dark:text-slate-200',
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-2">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate" title={label}>{label}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {blockLabel} · Reads from {upstream.length} · Writes to {downstream.length}
              </div>
            </div>
            <button
              ref={firstFocusableRef}
              type="button"
              onClick={close}
              aria-label="Close"
              className="p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Upstream / Downstream */}
          {(upstream.length > 0 || downstream.length > 0) && (
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Reads from</div>
                <ul className="space-y-0.5">
                  {upstream.length === 0 ? (
                    <li className="text-slate-400 italic">—</li>
                  ) : (
                    upstream.map((u) => (
                      <li key={u.id} className="truncate" title={u.label}>{u.label}</li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">Writes to</div>
                <ul className="space-y-0.5">
                  {downstream.length === 0 ? (
                    <li className="text-slate-400 italic">—</li>
                  ) : (
                    downstream.map((d) => (
                      <li key={d.id} className="truncate" title={d.label}>{d.label}</li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}

          {/* Variables in scope */}
          <div className="mb-2">
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Variables in scope</div>
              {!catalogBlock && (
                <span
                  className="text-[9px] px-1 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  title="This block type was not found in the catalog — showing raw config keys."
                >
                  (no catalog entry)
                </span>
              )}
            </div>

            {catalogBlock ? (
              variableRows.length === 0 ? (
                <div className="text-slate-400 italic">No parameters defined for this block.</div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-700 rounded">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {variableRows.map((row) => {
                        const valueStr = row.filled ? truncate(formatValue(row.rawValue), 28) : '—';
                        const fullValueStr = formatValue(row.rawValue);
                        const dotClass = row.required && !row.filled
                          ? 'bg-red-500'
                          : row.filled
                            ? 'bg-emerald-500'
                            : 'bg-slate-300 dark:bg-slate-600';
                        const requiredStatus = row.required ? 'required' : 'optional';
                        const filledStatus = row.filled ? 'filled' : 'empty';
                        const aria = `${row.name}, ${row.type}, ${requiredStatus}, ${filledStatus}`;
                        const defaultTitle = row.defaultValue !== undefined
                          ? `default: ${formatValue(row.defaultValue)}`
                          : undefined;
                        const clickable = !!onOpenConfig;
                        const handleRowActivate = () => {
                          if (!onOpenConfig) return;
                          close();
                          onOpenConfig(row.name);
                        };
                        return (
                          <tr
                            key={row.name}
                            aria-label={aria}
                            role={clickable ? 'button' : undefined}
                            tabIndex={clickable ? 0 : undefined}
                            onClick={clickable ? handleRowActivate : undefined}
                            onKeyDown={
                              clickable
                                ? (e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      handleRowActivate();
                                    }
                                  }
                                : undefined
                            }
                            className={cn(
                              'border-b border-slate-100 dark:border-slate-700/60 last:border-b-0 align-top',
                              clickable && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/40 focus:outline-none focus:bg-slate-50 dark:focus:bg-slate-700/40',
                            )}
                          >
                            <td className="px-1.5 py-1 w-[40%]">
                              <div className="flex items-center gap-1">
                                <span
                                  aria-hidden="true"
                                  className={cn('inline-block h-1.5 w-1.5 rounded-full shrink-0', dotClass)}
                                  title={`${requiredStatus} · ${filledStatus}`}
                                />
                                <span className="font-mono text-slate-600 dark:text-slate-300 truncate" title={row.name}>
                                  {row.name}
                                </span>
                                {row.required && (
                                  <span className="text-red-500" aria-hidden="true" title="Required">*</span>
                                )}
                                <span
                                  className={cn(
                                    'inline-block px-1 rounded text-[9px] shrink-0',
                                    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                                  )}
                                  title={`type: ${row.type}`}
                                >
                                  {row.type}
                                </span>
                              </div>
                              {row.description && (
                                <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                                  {row.description}
                                </div>
                              )}
                            </td>
                            <td
                              className={cn(
                                'px-1.5 py-1 font-mono truncate max-w-0',
                                row.filled ? '' : 'text-slate-400 dark:text-slate-500 italic',
                              )}
                              title={defaultTitle ? `${fullValueStr}\n${defaultTitle}` : fullValueStr}
                            >
                              {valueStr}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : fallbackEntries.length === 0 ? (
              <div className="text-slate-400 italic">No variables set yet.</div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded">
                <table className="w-full text-[11px]">
                  <tbody>
                    {fallbackEntries.map(([k, v]) => {
                      const t = inferType(v);
                      return (
                        <tr key={k} className="border-b border-slate-100 dark:border-slate-700/60 last:border-b-0">
                          <td className="px-1.5 py-0.5 font-mono text-slate-500 dark:text-slate-400 w-[35%] truncate" title={k}>{k}</td>
                          <td className="px-1.5 py-0.5 font-mono truncate max-w-0" title={formatValue(v)}>
                            {formatValue(v)}
                          </td>
                          <td className="px-1.5 py-0.5 text-right">
                            <span className={cn('inline-block px-1 rounded text-[9px]', TYPE_CHIP_PALETTE[t] ?? TYPE_CHIP_PALETTE.string)}>
                              {t}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {catalogBlock && extraVariableKeys.length > 0 && (
              <details className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200">
                  Extra variables ({extraVariableKeys.length})
                </summary>
                <ul className="mt-1 pl-3 space-y-0.5">
                  {extraVariableKeys.map((k) => (
                    <li key={k} className="font-mono truncate" title={`${k}: ${formatValue(config[k])}`}>
                      <span className="text-slate-600 dark:text-slate-300">{k}</span>
                      <span className="text-slate-400 dark:text-slate-500">
                        {' = '}
                        {truncate(formatValue(config[k]), 24)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {/* Compiled snippet */}
          <div className="mb-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
              Compiled snippet{compiledSnippet ? '' : ' (template)'}
            </div>
            <pre
              className={cn(
                'bg-slate-900 text-slate-100 dark:bg-slate-950',
                'rounded p-2 text-[10px] font-mono leading-tight',
                'overflow-x-auto whitespace-pre',
                'max-h-[120px]',
              )}
            >
{snippet}
            </pre>
          </div>

          {/* Footer */}
          {onOpenConfig && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  close();
                  onOpenConfig();
                }}
                aria-label="Open full config sidebar"
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                Open full config →
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default NodeBigPicturePopover;
