'use client';

/**
 * KpiLifecyclePanel — KPI lifecycle for a data product.
 *
 * Wires the catalog KPI lifecycle against `/catalog/*`:
 *   - list product KPIs            (getCatalogProductKpis)
 *   - create a KPI (inline row)    (createCatalogKpi)
 *   - validate a DRAFT KPI         (validateCatalogKpi)
 *   - auto-generate KPIs           (generateProductKpis)
 *   - recommend a model            (recommendProductModel)
 *
 * Create uses an inline-editable row (no modal). Every async action runs the
 * Idle→Running→Completed/Empty/Error state machine and degrades to an inline
 * error. No fake zeros — missing counts render "—".
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import EmptyState from '@/components/ui/EmptyState';
import {
  createCatalogKpi,
  generateProductKpis,
  getCatalogProductKpis,
  recommendProductModel,
  validateCatalogKpi,
  type CatalogKpi,
} from '@/app/services/catalog';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

const STATUS_TINT: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  VALIDATED:
    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  PUBLISHED:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
};

export interface KpiLifecyclePanelProps {
  productId: string;
}

function asKpis(data: any): CatalogKpi[] {
  if (Array.isArray(data)) return data as CatalogKpi[];
  if (Array.isArray(data?.items)) return data.items as CatalogKpi[];
  if (Array.isArray(data?.kpis)) return data.kpis as CatalogKpi[];
  return [];
}

export default function KpiLifecyclePanel({ productId }: KpiLifecyclePanelProps) {
  const [kpis, setKpis] = useState<CatalogKpi[]>([]);
  const [loadState, setLoadState] = useState<AsyncState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDef, setNewDef] = useState('');

  const load = useCallback(async () => {
    setLoadState('running');
    setLoadError(null);
    try {
      const data = await getCatalogProductKpis(productId);
      setKpis(asKpis(data));
      setLoadState('done');
    } catch (err) {
      setLoadError(getApiErrorMessage(err));
      setLoadState('error');
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setActionError(null);
      try {
        await fn();
        await load();
      } catch (err) {
        setActionError(getApiErrorMessage(err));
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const submitNew = useCallback(async () => {
    if (!newName.trim()) {
      setActionError('KPI name is required.');
      return;
    }
    await run('create', () =>
      createCatalogKpi({
        kpi_name: newName.trim(),
        product_id: productId,
        business_definition: newDef.trim() || undefined,
      }),
    );
    setNewName('');
    setNewDef('');
    setAdding(false);
  }, [newName, newDef, productId, run]);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <Sparkles className="h-3.5 w-3.5" />
          KPIs
        </h4>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy != null}
            onClick={() =>
              void run('generate', () => generateProductKpis(productId))
            }
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {busy === 'generate' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Wand2 className="h-3 w-3" />
            )}
            Generate
          </button>
          <button
            type="button"
            disabled={busy != null}
            onClick={() =>
              void run('recommend', () => recommendProductModel(productId))
            }
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {busy === 'recommend' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Recommend model
          </button>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        </div>
      </div>

      {/* Inline create row (no modal) */}
      {adding && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-2.5 dark:border-blue-900/40 dark:bg-blue-900/10">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="KPI name *"
            aria-label="KPI name"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <input
            value={newDef}
            onChange={(e) => setNewDef(e.target.value)}
            placeholder="Business definition (optional)"
            aria-label="Business definition"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName('');
                setNewDef('');
              }}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
            <button
              type="button"
              disabled={busy === 'create'}
              onClick={() => void submitNew()}
              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy === 'create' && <Loader2 className="h-3 w-3 animate-spin" />}
              Create KPI
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-words">{actionError}</span>
        </div>
      )}

      {loadState === 'running' || loadState === 'idle' ? (
        <div className="space-y-1.5" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : loadState === 'error' ? (
        <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="flex-1">
            <span className="break-words">{loadError}</span>{' '}
            <button type="button" className="underline" onClick={() => void load()}>
              Retry
            </button>
          </div>
        </div>
      ) : kpis.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          compact
          title="No KPIs yet"
          description="Create one inline, or auto-generate from the product's model."
        />
      ) : (
        <ul className="space-y-1.5">
          {kpis.map((k) => (
            <li
              key={k.kpi_id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200">
                  {k.kpi_name}
                </p>
                {k.business_definition && (
                  <p className="truncate text-[10px] text-slate-500">
                    {k.business_definition}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[9px] font-semibold',
                    STATUS_TINT[k.status] ?? STATUS_TINT.DRAFT,
                  )}
                >
                  {k.status}
                </span>
                {k.status === 'DRAFT' && (
                  <button
                    type="button"
                    disabled={busy != null}
                    onClick={() =>
                      void run(`validate-${k.kpi_id}`, () =>
                        validateCatalogKpi(k.kpi_id),
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-1.5 py-0.5 text-[9px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20"
                  >
                    {busy === `validate-${k.kpi_id}` ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-2.5 w-2.5" />
                    )}
                    Validate
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
