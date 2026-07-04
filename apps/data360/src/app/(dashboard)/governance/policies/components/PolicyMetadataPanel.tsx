'use client';

/**
 * PolicyMetadataPanel — docked right-tab editor for a policy's expiration/comment.
 *
 * NEW capability (Round 3): edit a policy's metadata in place via
 *   PUT /gouvernance/policies/{policy_type}/{policy_name}/metadata
 * instead of drop + recreate. There was NO prior modal for this — this panel
 * ADDS the docked right-tab surface (it does not migrate an existing popup).
 *
 * Two sections, both bound to the same selected policy:
 *   1. Edit metadata  — pick a policy of the active type, edit expiration +
 *      comment, save. Honest loading / empty / error.
 *   2. Where applied  — contextual reference list (getPolicyReferences) so the
 *      steward sees "applied to N objects" before changing an expiry.
 *
 * Writes are gated with useCanPerform('gouvernance','apply') — the same gate the
 * masking/RLS content uses for policy mutations; the backend 403 is the real
 * guard and is surfaced honestly via toast. Light theme, no reskin, ASCII only.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Pencil, MapPin, Loader2, RefreshCw, Save, AlertTriangle, CalendarClock, Eraser,
} from 'lucide-react';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  listPoliciesEnriched,
  getPolicyReferences,
  updatePolicyMetadata,
  formatPolicyError,
  type EnrichedPolicy,
  type PolicyReference,
} from '@/app/services/governance/policies';

/** Policy types that expose the enriched list endpoint (used to populate the picker). */
export type MetadataPolicyType =
  | 'AGGREGATION'
  | 'MASKING'
  | 'PASSWORD'
  | 'ROW_ACCESS'
  | 'SESSION';

export interface PolicyMetadataPanelProps {
  /** Active policy type; null closes the panel. */
  policyType: MetadataPolicyType | null;
  /** Human label for the header (e.g. "Row Access"). */
  policyTypeLabel?: string;
  onClose: () => void;
  /** Called after a successful metadata save so the host can refetch its list. */
  onSaved?: () => void;
}

type SectionId = 'edit' | 'applied';

/** ISO 'YYYY-MM-DDTHH:mm:ssZ' -> 'YYYY-MM-DD' for a <input type="date">. */
function isoToDateInput(iso?: string | null): string {
  if (!iso) return '';
  const d = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
}

export default function PolicyMetadataPanel({
  policyType,
  policyTypeLabel,
  onClose,
  onSaved,
}: PolicyMetadataPanelProps) {
  const [section, setSection] = useState<SectionId>('edit');

  // ── policy list (picker) ──
  const [policies, setPolicies] = useState<EnrichedPolicy[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState('');

  const loadList = useCallback(async () => {
    if (!policyType) return;
    setListLoading(true);
    setListError(null);
    try {
      const rows = await listPoliciesEnriched(policyType);
      setPolicies(rows);
    } catch (e) {
      setListError(formatPolicyError(e, 'Could not load policies'));
      setPolicies([]);
    } finally {
      setListLoading(false);
    }
  }, [policyType]);

  // reset selection + reload whenever the policy type changes; clearing the
  // selection cascades to the references effect below (selected -> null).
  useEffect(() => {
    setSelectedName('');
    if (policyType) loadList();
  }, [policyType, loadList]);

  const selected = useMemo(
    () => policies.find((p) => p.name === selectedName) ?? null,
    [policies, selectedName],
  );

  // ── editable fields, seeded from the selected policy ──
  const [expDate, setExpDate] = useState('');
  const [comment, setComment] = useState('');

  useEffect(() => {
    setExpDate(isoToDateInput(selected?.expiration_date));
    setComment(selected?.comment ?? '');
  }, [selected]);

  // ── references (contextual "where applied") ──
  const [references, setReferences] = useState<PolicyReference[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [refError, setRefError] = useState<string | null>(null);

  const loadReferences = useCallback(async () => {
    if (!policyType || !selected) return;
    setRefLoading(true);
    setRefError(null);
    try {
      const res = await getPolicyReferences(
        policyType,
        selected.name,
        selected.database_name || undefined,
        selected.schema_name || undefined,
      );
      setReferences(res.references ?? []);
    } catch (e) {
      setRefError(formatPolicyError(e, 'Could not load references'));
      setReferences([]);
    } finally {
      setRefLoading(false);
    }
  }, [policyType, selected]);

  useEffect(() => {
    if (selected) loadReferences();
    else setReferences([]);
  }, [selected, loadReferences]);

  // ── permissions ──
  const { allowed: canEdit } = useCanPerform('gouvernance', 'apply');

  // ── save ──
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => {
    if (!selected) return false;
    return (
      expDate !== isoToDateInput(selected.expiration_date) ||
      comment !== (selected.comment ?? '')
    );
  }, [selected, expDate, comment]);

  const handleSave = useCallback(async () => {
    if (!policyType || !selected) return;
    setSaving(true);
    try {
      await updatePolicyMetadata(
        policyType,
        selected.name,
        {
          // end-of-day UTC so the policy stays valid through the chosen date;
          // empty input clears the expiration (null).
          expiration_date: expDate ? `${expDate}T23:59:59Z` : null,
          comment: comment.trim() ? comment.trim() : null,
        },
        selected.database_name || undefined,
        selected.schema_name || undefined,
      );
      toast.success(`Updated metadata for ${selected.name}`);
      await loadList();
      onSaved?.();
    } catch (e) {
      toast.error(formatPolicyError(e, 'Failed to update policy metadata'));
    } finally {
      setSaving(false);
    }
  }, [policyType, selected, expDate, comment, loadList, onSaved]);

  if (!policyType) return null;

  // ── shared honest-state primitive ──
  const StateBlock = ({ children }: { children: React.ReactNode }) => (
    <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">{children}</div>
  );

  const picker = () => (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
        Policy
      </label>
      {listLoading ? (
        <StateBlock>
          <Loader2 className="mx-auto mb-1 h-4 w-4 animate-spin" /> Loading policies…
        </StateBlock>
      ) : listError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> {listError}
          </div>
          <button onClick={loadList} className="underline">Retry</button>
        </div>
      ) : policies.length === 0 ? (
        <StateBlock>No {policyTypeLabel ?? policyType} policies found.</StateBlock>
      ) : (
        <select
          value={selectedName}
          onChange={(e) => setSelectedName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">Select a policy…</option>
          {policies.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name}
              {p.granted_objects_count ? ` (${p.granted_objects_count} obj)` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  const editBody = () => (
    <div className="space-y-4">
      {picker()}

      {!selected ? (
        // DEFAULT / OVERVIEW state — no policy picked yet. Purposeful summary
        // (how many policies of this type are editable, reusing the already-loaded
        // list) plus clear guidance, instead of a bare one-liner.
        <div className="space-y-2 py-6 text-center">
          <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">
            {listLoading ? '—' : policies.length > 0 ? policies.length : '—'}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {policyTypeLabel ?? policyType} {policies.length === 1 ? 'policy' : 'policies'} available to edit
          </p>
          <p className="text-xs text-slate-400">
            Select a policy above to edit its expiration and comment in place.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-400">
            <span className="font-mono text-slate-600 dark:text-slate-300">
              {selected.database_name}.{selected.schema_name}.{selected.name}
            </span>
            <div className="mt-1">
              Current expiry:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {selected.expiration_date ? selected.expiration_date.slice(0, 10) : '—'}
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <CalendarClock className="h-3.5 w-3.5" /> Expiration date
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                disabled={!canEdit || saving}
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-violet-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => setExpDate('')}
                disabled={!canEdit || saving || !expDate}
                title="Clear expiration (no expiry)"
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Eraser className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Blank = no expiration. Stored as end-of-day UTC.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Comment
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={!canEdit || saving}
              rows={3}
              placeholder="Policy description / steward note"
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {!canEdit && (
            <p className="text-[10px] text-slate-400">
              You do not have permission to edit policy metadata.
            </p>
          )}
        </>
      )}
    </div>
  );

  const appliedBody = () => {
    if (!selected) {
      return <StateBlock>Select a policy to see where it is applied.</StateBlock>;
    }
    if (refLoading) {
      return (
        <StateBlock>
          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Loading references…
        </StateBlock>
      );
    }
    if (refError) {
      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          <div className="mb-1 flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> {refError}
          </div>
          <button onClick={loadReferences} className="underline">Retry</button>
        </div>
      );
    }
    if (references.length === 0) {
      return <StateBlock>This policy is not applied to any object.</StateBlock>;
    }
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-2.5 py-1.5 font-medium">Object</th>
              <th className="px-2.5 py-1.5 font-medium">Column</th>
              <th className="px-2.5 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {references.map((r, i) => (
              <tr key={`${r.table}-${r.column ?? ''}-${i}`}>
                <td className="px-2.5 py-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {[r.database, r.schema, r.table].filter(Boolean).join('.') || '—'}
                </td>
                <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400">
                  {r.column ?? '—'}
                </td>
                <td className="px-2.5 py-1.5 text-slate-500 dark:text-slate-400">
                  {r.policy_status ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const sections: RightTabSection[] = [
    {
      id: 'edit',
      icon: Pencil,
      label: 'Edit metadata',
      description: 'Edit a policy\'s expiration and comment in place (no drop + recreate).',
      render: editBody,
    },
    {
      id: 'applied',
      icon: MapPin,
      label: 'Where applied',
      description: 'Objects this policy is currently applied to.',
      render: appliedBody,
    },
  ];

  return (
    <RightTabPanel
      title={policyTypeLabel ?? policyType}
      subtitle="Policy metadata"
      sections={sections}
      activeSection={section}
      onSectionChange={(id) => setSection(id as SectionId)}
      onClose={onClose}
      storageKey="data360.gov.policyMetadata.section.v1"
      accentClassName="bg-violet-500"
      statusPill={{
        label: listError ? 'error' : listLoading ? 'loading' : `${policies.length} policies`,
        tone: listError ? 'error' : 'ok',
      }}
      footer={
        section === 'edit' ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              isLoading={saving}
              disabled={!canEdit || !selected || !dirty}
              className="flex-1 gap-1.5 bg-violet-600 text-white hover:bg-violet-700"
            >
              <Save className="h-3.5 w-3.5" /> Save metadata
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={loadList}
              disabled={listLoading}
              className="gap-1.5"
            >
              <RefreshCw className={listLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={loadReferences}
            disabled={refLoading || !selected}
            className="w-full gap-1.5"
          >
            <RefreshCw className={refLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh references
          </Button>
        )
      }
    />
  );
}
