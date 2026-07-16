'use client';

import { useEffect } from 'react';

/**
 * Self-heals ChunkLoadError. Two situations produce it:
 *  - `next dev`: client-side navigation to a route that just recompiled can
 *    reference a stale chunk hash (e.g. the sidebar's lazy NeedSupport chunk) →
 *    "Loading chunk … failed". Reproduced on /governance/access-matrix.
 *  - production: after a new deploy, an already-open tab holds a stale build
 *    manifest and a later dynamic import 404s.
 * In both cases a single hard reload fetches the fresh manifest and the error
 * is gone. We guard with a sessionStorage flag so a *persistent* chunk error
 * (genuinely broken build) reloads at most once per unstable window instead of
 * looping. The flag is cleared a few seconds after a successful mount, so a
 * later, unrelated transient error can still self-heal.
 */
const RELOAD_FLAG = 'd360:chunk-reload-inflight';
const CHUNK_RE =
  /ChunkLoadError|Loading chunk [\w./-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module/i;

export default function ChunkErrorReloader() {
  useEffect(() => {
    // We mounted, so the current build loaded fine — clear any prior guard once
    // the app has settled, re-arming self-heal for a future transient error.
    const clearGuard = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* sessionStorage unavailable — nothing to clear */
      }
    }, 4000);

    const reloadOnce = () => {
      try {
        if (sessionStorage.getItem(RELOAD_FLAG)) return; // already reloaded this window → don't loop
        sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch {
        /* if sessionStorage is blocked, fall through and still reload once */
      }
      window.location.reload();
    };

    const matches = (v: unknown): boolean =>
      typeof v === 'string' && CHUNK_RE.test(v);

    const onError = (e: ErrorEvent) => {
      const err = e?.error as { name?: string; message?: string } | undefined;
      if (matches(e?.message) || matches(err?.name) || matches(err?.message)) {
        reloadOnce();
      }
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e?.reason as { name?: string; message?: string } | string | undefined;
      if (typeof r === 'string') {
        if (matches(r)) reloadOnce();
      } else if (matches(r?.name) || matches(r?.message)) {
        reloadOnce();
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.clearTimeout(clearGuard);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
