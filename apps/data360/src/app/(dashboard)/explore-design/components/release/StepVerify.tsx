'use client';

/**
 * Release ▸ Step 6 — Verify (post-deploy only): schema comparison of the
 * deployed target vs. the model. Feeder (WIRED): POST /post-verify.
 * "Mark verified" appends an outcome event to the AI analyst feed (new POST
 * ai/history — degrades honestly when not live yet).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, SearchCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import { getProjectEvents } from '@/app/services/explore-design';
import { postVerifyDeployment } from '@/app/services/api/exploreDesignApi';
import type { PostVerifyResult } from '@/app/services/api/types';
import { appendAiHistory } from './api';
import {
  StepButton,
  StepSection,
  UnavailableNote,
  fmtCount,
  useGatedAction,
} from './ui';

export default function StepVerify({ projectId }: { projectId: string }) {
  const [database, setDatabase] = useState('');
  const [schema, setSchema] = useState('');
  const [result, setResult] = useState<PostVerifyResult | null>(null);
  const [running, setRunning] = useState(false);
  const [verifyUnavailable, setVerifyUnavailable] = useState(false);

  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState(false);
  const [markUnavailable, setMarkUnavailable] = useState(false);
  const canMark = useGatedAction('edit', projectId);

  // Prefill target db/schema from the project's changed tables (honest default).
  useEffect(() => {
    let cancelled = false;
    void getProjectEvents(projectId)
      .then(({ events }) => {
        if (cancelled) return;
        const t = events.find((e) => e.target?.database && e.target?.schema)?.target;
        if (t) {
          setDatabase((d) => d || t.database);
          setSchema((s) => s || t.schema);
        }
      })
      .catch(() => {
        /* prefill only — inputs stay editable */
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const runVerify = useCallback(async () => {
    if (!database.trim() || !schema.trim()) return;
    setRunning(true);
    try {
      const res = await postVerifyDeployment(projectId, {
        database: database.trim(),
        schema_name: schema.trim(),
      });
      setResult(res);
      if (res.status === 'match') toast.success('Deployed schema matches the model');
      else if (res.status === 'drift') toast.error('Schema drift detected');
    } catch (err) {
      if (isUnavailable(err)) setVerifyUnavailable(true);
      else toast.error(getApiErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }, [projectId, database, schema]);

  const markVerified = useCallback(async () => {
    setMarking(true);
    try {
      await appendAiHistory(projectId, {
        kind: 'outcome',
        axis: 'release',
        severity: 'info',
        message: 'Release marked as verified after post-deploy checks.',
        payload: result ? { post_verify_status: result.status } : undefined,
      });
      setMarked(true);
      toast.success('Release marked verified');
    } catch (err) {
      if (isUnavailable(err)) setMarkUnavailable(true);
      else toast.error(getApiErrorMessage(err));
    } finally {
      setMarking(false);
    }
  }, [projectId, result]);

  const inputClass =
    'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';

  return (
    <StepSection
      title="Verify"
      subtitle="Post-deploy checks: does the target match the shipped model?"
      actions={
        <StepButton
          onClick={markVerified}
          disabled={marking || marked || markUnavailable || !canMark.allowed || !result}
          title={
            canMark.deniedTitle ??
            (markUnavailable
              ? 'The release history feed is not available yet on this environment'
              : !result
                ? 'Run verification first'
                : marked
                  ? 'Already marked verified'
                  : undefined)
          }
        >
          <BadgeCheck className="h-3 w-3" aria-hidden="true" />
          {marked ? 'Verified' : marking ? 'Marking…' : 'Mark verified'}
        </StepButton>
      }
    >
      <div className="space-y-3">
        {verifyUnavailable && <UnavailableNote what="Post-deploy verification" />}

        <div className="grid grid-cols-2 gap-2">
          <input
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
            placeholder="Target database"
            aria-label="Target database"
            className={inputClass}
          />
          <input
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
            placeholder="Target schema"
            aria-label="Target schema"
            className={inputClass}
          />
        </div>

        <StepButton
          variant="primary"
          onClick={runVerify}
          disabled={running || verifyUnavailable || !database.trim() || !schema.trim()}
          title={
            !database.trim() || !schema.trim()
              ? 'Set the deployed database and schema first'
              : undefined
          }
          className="w-full justify-center"
        >
          <SearchCheck className="h-3 w-3" aria-hidden="true" />
          {running ? 'Verifying…' : 'Run verification'}
        </StepButton>

        {result && (
          <div className="rounded-md border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 text-[11px] dark:border-slate-700/60">
              <span className="text-slate-600 dark:text-slate-300">
                {fmtCount(result.tables_checked)} table(s) · {fmtCount(result.columns_checked)}{' '}
                column(s) · {fmtCount(result.passed)} passed · {fmtCount(result.failed)} failed
              </span>
              <span
                className={
                  result.status === 'match'
                    ? 'rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                    : 'rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }
              >
                {result.status}
              </span>
            </div>
            {result.mismatches.length > 0 && (
              <ul className="max-h-40 divide-y divide-slate-100 overflow-auto dark:divide-slate-700/60">
                {result.mismatches.map((m, i) => (
                  <li key={`${m.object_name}-${i}`} className="px-2 py-1.5 text-[11px]">
                    <span
                      className={
                        m.severity === 'error'
                          ? 'font-medium text-red-600 dark:text-red-400'
                          : 'font-medium text-amber-600 dark:text-amber-400'
                      }
                    >
                      {m.object_type} {m.object_name}
                    </span>{' '}
                    <span className="text-slate-500 dark:text-slate-400">
                      expected {m.expected}, got {m.actual}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </StepSection>
  );
}
