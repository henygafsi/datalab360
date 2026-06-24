'use client';

/**
 * ProductLifecycleActions — the missing lifecycle controls for a data product,
 * surfaced inside the product detail right-rail.
 *
 * Publish + Subscribe already live elsewhere (PublishGate + ProductCard), so this
 * panel wires the three that had a backend route but no UI:
 *   - Refresh data   → POST /data-products/{id}/refresh   (refreshDataProduct)
 *   - Subscribers    → GET  /data-products/{id}/consumers (getDataProductConsumers) + subscribe
 *   - Lineage        → GET  /data-products/{id}/lineage   (getDataProductLineage)
 *
 * Per the no-popup house rule, Subscribers and Lineage are inline expandable
 * subsections (lazy-fetched on first open), not modals. Refresh is a confirm →
 * toast action. Every mutating control is gated through System-2 Action-RBAC and
 * fails open only while the allow-set loads.
 */

import { useCallback, useState } from 'react';
import {
  RefreshCw, Users, GitBranch, Loader2, AlertCircle,
  ChevronDown, ChevronRight, CheckCircle, Share2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useCanPerform } from '@/hooks/useCanPerform';
import { getApiErrorMessage } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import {
  refreshDataProduct,
  getDataProductConsumers,
  getDataProductLineage,
  subscribeToProduct,
  type DataProductConsumersResponse,
  type DataProductLineageResponse,
} from '@/app/services/data-products';

type AsyncStatus = 'idle' | 'loading' | 'ok' | 'error';

interface SectionState<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
}

const INITIAL: SectionState<never> = { status: 'idle', data: null, error: null };

/** Render an unknown record row as a readable, ASCII-safe label from its primitive values. */
function recordLabel(row: Record<string, unknown>): string {
  const parts = Object.values(row).filter(
    (v) => v !== null && v !== undefined && (typeof v === 'string' || typeof v === 'number'),
  );
  return parts.length ? parts.map(String).join(' / ') : '—';
}

export interface ProductLifecycleActionsProps {
  productId: string;
  productName: string;
  /** A published product backs a live share — subscribe is only valid then. */
  isPublished: boolean;
  /** Called after a refresh / subscribe so the parent can refetch the portfolio. */
  onChanged?: () => void;
}

export default function ProductLifecycleActions({
  productId,
  productName,
  isPublished,
  onChanged,
}: ProductLifecycleActionsProps) {
  // System-2 Action-RBAC gates. Refresh edits the product's backing object →
  // 'edit' (matches the backend require_action on /refresh). Subscribe → 'subscribe'.
  const editPerm = useCanPerform('data_products', 'edit');
  const canRefresh = editPerm.allowed || editPerm.loading;
  const subscribePerm = useCanPerform('data_products', 'subscribe');
  const canSubscribe = subscribePerm.allowed || subscribePerm.loading;

  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [showConsumers, setShowConsumers] = useState(false);
  const [consumers, setConsumers] = useState<SectionState<DataProductConsumersResponse>>(INITIAL);
  const [subscribing, setSubscribing] = useState(false);

  const [showLineage, setShowLineage] = useState(false);
  const [lineage, setLineage] = useState<SectionState<DataProductLineageResponse>>(INITIAL);

  // --- Refresh ---
  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await refreshDataProduct(productId);
      if (res.refreshed) {
        toast({ title: 'Refresh complete', description: res.message || `"${productName}" was refreshed.` });
      } else {
        // Honest non-refresh (plain table / view) — surface the backend reason, not a fake success.
        toast({ title: 'Nothing to refresh', description: res.reason || res.message || 'The backing object has no manual refresh.' });
      }
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Refresh failed', description: getApiErrorMessage(err) });
    } finally {
      setRefreshing(false);
    }
  }, [productId, productName, onChanged]);

  // --- Consumers (lazy) ---
  const loadConsumers = useCallback(async () => {
    setConsumers({ status: 'loading', data: null, error: null });
    try {
      const data = await getDataProductConsumers(productId);
      setConsumers({ status: 'ok', data, error: null });
    } catch (err) {
      setConsumers({ status: 'error', data: null, error: getApiErrorMessage(err) });
    }
  }, [productId]);

  const toggleConsumers = useCallback(() => {
    setShowConsumers((open) => {
      const next = !open;
      if (next && consumers.status === 'idle') void loadConsumers();
      return next;
    });
  }, [consumers.status, loadConsumers]);

  const doSubscribe = useCallback(async () => {
    setSubscribing(true);
    try {
      const res = await subscribeToProduct(productId);
      toast({ title: 'Subscribed', description: res.name ? `Access granted to "${res.name}".` : 'Subscription confirmed.' });
      void loadConsumers();
      onChanged?.();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Subscribe failed', description: getApiErrorMessage(err) });
    } finally {
      setSubscribing(false);
    }
  }, [productId, loadConsumers, onChanged]);

  // --- Lineage (lazy) ---
  const loadLineage = useCallback(async () => {
    setLineage({ status: 'loading', data: null, error: null });
    try {
      const data = await getDataProductLineage(productId);
      setLineage({ status: 'ok', data, error: null });
    } catch (err) {
      setLineage({ status: 'error', data: null, error: getApiErrorMessage(err) });
    }
  }, [productId]);

  const toggleLineage = useCallback(() => {
    setShowLineage((open) => {
      const next = !open;
      if (next && lineage.status === 'idle') void loadLineage();
      return next;
    });
  }, [lineage.status, loadLineage]);

  const subscribeDisabledReason = !canSubscribe
    ? 'You lack the "subscribe" permission on data products. Ask an administrator to grant it.'
    : !isPublished
      ? 'Not published yet — publish this product as a data share first to enable subscriptions.'
      : undefined;

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
        <Share2 className="h-3.5 w-3.5" />
        Lifecycle actions
      </h4>

      {/* Refresh data */}
      <button
        type="button"
        onClick={() => setConfirmRefresh(true)}
        disabled={refreshing || !canRefresh}
        title={!canRefresh ? 'You lack the "edit" permission on data products. Ask an administrator to grant it.' : 'Refresh the product\'s backing object'}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        <span className="flex-1 text-left">Refresh data</span>
      </button>

      {/* Manage subscribers */}
      <button
        type="button"
        onClick={toggleConsumers}
        aria-expanded={showConsumers}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Users className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Manage subscribers</span>
        {showConsumers ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
      </button>
      {showConsumers && (
        <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 dark:border-gray-800 dark:bg-gray-800/30">
          {consumers.status === 'loading' && (
            <div className="space-y-1.5" aria-hidden>
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
              ))}
            </div>
          )}
          {consumers.status === 'error' && (
            <div className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{consumers.error}</span>
              <button type="button" className="ml-auto shrink-0 underline" onClick={() => void loadConsumers()}>Retry</button>
            </div>
          )}
          {consumers.status === 'ok' && consumers.data && (
            <>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Subscribers ({consumers.data.subscribers?.length ?? 0})
                </p>
                {consumers.data.subscribers && consumers.data.subscribers.length > 0 ? (
                  <ul className="space-y-0.5">
                    {consumers.data.subscribers.slice(0, 8).map((row, i) => (
                      <li key={i} className="truncate text-[11px] text-gray-700 dark:text-gray-300">• {recordLabel(row)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-gray-400">No subscribers yet.</p>
                )}
              </div>
              {consumers.data.recent_readers && consumers.data.recent_readers.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    Recent readers ({consumers.data.recent_readers.length})
                  </p>
                  <ul className="space-y-0.5">
                    {consumers.data.recent_readers.slice(0, 5).map((row, i) => (
                      <li key={i} className="truncate text-[11px] text-gray-600 dark:text-gray-400">• {recordLabel(row)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => void doSubscribe()}
            disabled={subscribing || !canSubscribe || !isPublished}
            title={subscribeDisabledReason}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {subscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
            Subscribe my account
          </button>
        </div>
      )}

      {/* View lineage */}
      <button
        type="button"
        onClick={toggleLineage}
        aria-expanded={showLineage}
        className="flex w-full items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <GitBranch className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">View lineage</span>
        {showLineage ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
      </button>
      {showLineage && (
        <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 dark:border-gray-800 dark:bg-gray-800/30">
          {lineage.status === 'loading' && (
            <div className="space-y-1.5" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-4 animate-pulse rounded bg-gray-100 dark:bg-gray-700" />
              ))}
            </div>
          )}
          {lineage.status === 'error' && (
            <div className="flex items-start gap-1.5 text-[11px] text-rose-600 dark:text-rose-400">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="break-words">{lineage.error}</span>
              <button type="button" className="ml-auto shrink-0 underline" onClick={() => void loadLineage()}>Retry</button>
            </div>
          )}
          {lineage.status === 'ok' && lineage.data && (
            <>
              {lineage.data.objects && lineage.data.objects.length > 0 && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Objects</p>
                  <ul className="space-y-0.5">
                    {lineage.data.objects.slice(0, 5).map((o, i) => (
                      <li key={i} className="truncate font-mono text-[11px] text-gray-700 dark:text-gray-300">{o}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Upstream ({lineage.data.upstream?.length ?? 0})
                </p>
                {lineage.data.upstream && lineage.data.upstream.length > 0 ? (
                  <ul className="space-y-0.5">
                    {lineage.data.upstream.slice(0, 6).map((row, i) => (
                      <li key={i} className="truncate text-[11px] text-gray-700 dark:text-gray-300">↑ {recordLabel(row)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-gray-400">—</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  Downstream ({lineage.data.downstream?.length ?? 0})
                </p>
                {lineage.data.downstream && lineage.data.downstream.length > 0 ? (
                  <ul className="space-y-0.5">
                    {lineage.data.downstream.slice(0, 6).map((row, i) => (
                      <li key={i} className="truncate text-[11px] text-gray-700 dark:text-gray-300">↓ {recordLabel(row)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[11px] text-gray-400">—</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmRefresh}
        title="Refresh this product?"
        message="Refreshes the product's backing object (dynamic tables are refreshed in place). Views and plain tables have nothing to refresh."
        confirmLabel="Refresh"
        destructive={false}
        onConfirm={() => { setConfirmRefresh(false); void doRefresh(); }}
        onCancel={() => setConfirmRefresh(false)}
      />
    </div>
  );
}
