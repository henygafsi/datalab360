'use client';

/**
 * GovernanceTagsPanel — classification & governance-tag visibility.
 *
 * Surfaces every governance tag (the classification vocabulary: PII / PHI /
 * SENSITIVITY / …) in the shared, paginated {@link AuditTable} (auto-detected
 * filters + 10/page). Read-only; honest states throughout:
 *   loading → skeleton · error → retry · resolved-empty → real empty state.
 *
 * Reuses getTags() (existing service getter) — no new endpoints. Lives on the
 * Policies page alongside the Tags tab to give an at-a-glance, filterable
 * inventory without disturbing the per-tag CRUD flow.
 */

import { useCallback, useEffect, useState } from 'react';
import { PiTag } from 'react-icons/pi';
import { Badge } from 'rizzui';
import AuditTable from '@/app/shared/command-center/AuditTable';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import { getTags, type Tag } from '@/app/services/governance/policies';

type Status = 'loading' | 'ready' | 'error';

export default function GovernanceTagsPanel() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const t = await getTags();
      setTags(Array.isArray(t) ? t : []);
      setStatus('ready');
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load governance tags');
      setTags([]);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Flatten to clean, prettify-friendly keys for the auto-detecting AuditTable.
  const rows = tags.map((t) => ({
    tag_name: t.tag_name,
    schema: t.schema,
    allowed_values: t.allowed_values || '',
    comment: t.comment || '',
    created_at: t.created_at || '',
  }));

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <PiTag className="h-4 w-4" /> Classification &amp; Tags
        </h2>
        {status === 'ready' && (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]">
            {tags.length} tag{tags.length === 1 ? '' : 's'}
          </Badge>
        )}
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-[11px] text-slate-400">Read-only inventory</span>
      </div>

      {status === 'loading' ? (
        <TableSkeleton rows={5} columns={4} />
      ) : status === 'error' ? (
        <ErrorDisplay error={error ?? 'Unable to load tags.'} onRetry={() => void load()} context="general" />
      ) : tags.length === 0 ? (
        <EmptyState
          icon={PiTag}
          title="No governance tags defined"
          description="Create a tag in the Tags tab to start classifying databases, tables, and columns (PII, PHI, sensitivity)."
        />
      ) : (
        <AuditTable
          rows={rows}
          title="Governance tags"
          subtitle="classification vocabulary"
          pageSize={10}
        />
      )}
    </section>
  );
}
