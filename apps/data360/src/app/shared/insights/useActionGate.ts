'use client';

/**
 * useActionGate — the honest two-tier gate for a "ready action" CTA.
 *
 * Tier 1 (advisory): an optional `capable` hint can pre-disable a verb the
 * backend says it doesn't support (mirrors the workflow capabilities gate).
 * Tier 2 (authoritative): the RUNTIME result — a 404/501 from the action's own
 * call flips it to `unavailable`. Absence of a capability flag = unknown/allowed
 * (let the runtime catch it). This is why a backend-gap CTA needs zero redeploy
 * to light up: the moment the route returns 200, the gate stops disabling it.
 *
 * On success it can ping the bell (the action will surface server-side) and
 * raise a toast. It NEVER fakes success and NEVER swallows a real error.
 *
 * See [[_actionable-insights-overlay]] §2 for the four honest states.
 */
import { useCallback, useState } from 'react';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import { pingNotifications } from '@/hooks/useNotifications';
import { toast } from '@/hooks/use-toast';

export type GateState = 'idle' | 'running' | 'done' | 'error' | 'unavailable';

export interface UseActionGateOptions {
  /**
   * Advisory capability hint. `false` pre-disables without a call; `true`/
   * `undefined` = allowed/unknown (the runtime 404/501 is authoritative).
   */
  capable?: boolean;
  /** Toast title shown on success (omit for a silent success). */
  successToast?: string;
  /** Ping the notifications bell on success (the action surfaces server-side). */
  pingBell?: boolean;
}

export interface ActionGate<T> {
  state: GateState;
  error: string | null;
  result: T | null;
  /** Run the gated async action. Resolves to the result, or `null` if it
   *  failed or was unavailable (never throws — inspect `state`/`error`). */
  run: (fn: () => Promise<T>) => Promise<T | null>;
  reset: () => void;
  /** Can't run: capability hint says no, or a prior call returned 404/501. */
  unavailable: boolean;
  /** Currently executing. */
  pending: boolean;
}

export function useActionGate<T = unknown>(
  opts: UseActionGateOptions = {},
): ActionGate<T> {
  const { capable, successToast, pingBell } = opts;
  const [state, setState] = useState<GateState>(
    capable === false ? 'unavailable' : 'idle',
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);

  const run = useCallback(
    async (fn: () => Promise<T>): Promise<T | null> => {
      if (capable === false) {
        setState('unavailable');
        return null;
      }
      setState('running');
      setError(null);
      try {
        const r = await fn();
        setResult(r);
        setState('done');
        if (successToast) toast({ title: successToast });
        if (pingBell) pingNotifications();
        return r;
      } catch (err) {
        if (isUnavailable(err)) {
          setState('unavailable');
          return null;
        }
        setError(getApiErrorMessage(err));
        setState('error');
        return null;
      }
    },
    [capable, successToast, pingBell],
  );

  const reset = useCallback(() => {
    setState(capable === false ? 'unavailable' : 'idle');
    setError(null);
    setResult(null);
  }, [capable]);

  return {
    state,
    error,
    result,
    run,
    reset,
    unavailable: state === 'unavailable',
    pending: state === 'running',
  };
}
