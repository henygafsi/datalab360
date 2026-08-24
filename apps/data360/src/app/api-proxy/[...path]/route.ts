/**
 * /api-proxy/[...path] — function-based proxy to the FastAPI backend.
 *
 * WHY THIS EXISTS (2026-08-24): the previous `/api-proxy/:path*` rewrite in
 * next.config.mjs proxies to an EXTERNAL upstream, and Vercel caps external
 * rewrites at ~30 seconds. Under warehouse queueing, Account Overview's
 * Snowflake scans routinely need 30–90s cold — the edge aborted the request
 * at ~30s, FastAPI cancelled the task, and QUERY_HISTORY filled with ~30s
 * "Failed" statements ("Failed to load …" toasts in the UI). A route handler
 * runs as a Vercel Function where we control the budget: maxDuration 180
 * ("all timeouts to 3 min" directive).
 *
 * Because filesystem routes win over rewrites, this handler takes precedence
 * over the legacy rewrite (kept in next.config.mjs as a dev/local fallback).
 *
 * Trailing slashes: `req.nextUrl.pathname` preserves them (with
 * skipTrailingSlashRedirect), so FastAPI's canonical `/` routes are hit
 * directly — no 307-to-absolute-URL redirect, no dropped Authorization
 * header. This also covers the three special-case rewrites.
 *
 * Streaming: the upstream body is piped through untouched, so SSE
 * (/cache-stream/stream) still streams; maxDuration caps one SSE connection
 * at 180s and the client's reconnect logic resumes it.
 */
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 180;
export const dynamic = 'force-dynamic';

const UPSTREAM = process.env.API_PROXY_UPSTREAM || 'http://api.datalab360.io';

// Headers that must not be forwarded hop-to-hop.
const STRIP_REQ = ['host', 'connection', 'content-length', 'accept-encoding'];
const STRIP_RES = ['content-encoding', 'content-length', 'transfer-encoding', 'connection'];

async function proxy(req: NextRequest): Promise<Response> {
  const path = req.nextUrl.pathname.replace(/^\/api-proxy/, '');
  const url = `${UPSTREAM}${path}${req.nextUrl.search}`;

  const headers = new Headers(req.headers);
  for (const h of STRIP_REQ) headers.delete(h);

  // Abort the upstream connect/first-byte at 175s (just under maxDuration so
  // the client gets an honest 504 instead of a platform kill). The timer is
  // cleared once headers arrive — long streaming bodies (SSE) then run under
  // the platform's own maxDuration budget.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 175_000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body,
      // @ts-expect-error -- required by Node fetch when streaming a request body
      duplex: 'half',
      redirect: 'manual',
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && err.name === 'AbortError';
    return Response.json(
      { detail: aborted ? 'Upstream timed out after 175s' : 'Upstream unreachable' },
      { status: aborted ? 504 : 502 },
    );
  }
  clearTimeout(timer);

  const respHeaders = new Headers(res.headers);
  for (const h of STRIP_RES) respHeaders.delete(h);
  return new Response(res.body, { status: res.status, headers: respHeaders });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
  proxy as HEAD,
  proxy as OPTIONS,
};
