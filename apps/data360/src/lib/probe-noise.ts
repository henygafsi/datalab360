/**
 * probe-noise — classify HTTP requests hitting the public API host as either
 * genuine application traffic or internet background-noise.
 *
 * Background-noise = automated vulnerability scanners (WordPress probes, PHP
 * web-shell hunts, `.env`/`.git` exfil attempts) and non-API infrastructure
 * paths (the bare root, favicon, metrics) that are not part of the product's API
 * surface. A publicly-reachable backend is scanned constantly, and the live
 * server-metrics counter tallies EVERY request to the host — so on a deployed
 * environment these scanner 404s dominate the error rate and bury the real
 * endpoints. Classifying lets the UI report honest application health while still
 * being able to surface the noise on demand.
 *
 * The denylist is intentionally conservative — only unambiguous junk. Every
 * product route is path-prefixed (`/admin`, `/gouvernance`, `/notifications`, …)
 * and none end in a web-shell extension or contain `wp-`/`wlwmanifest`/etc., so
 * this can never hide a real API route (including the genuinely-failing
 * `/deployments/track` and `/notifications/unread-count`).
 */

// Substrings that only ever appear in scanner / exploit probes.
const NOISE_SUBSTRINGS = [
  'wp-', // wp-includes, wp-content, wp-admin, wp-login
  'wlwmanifest',
  'xmlrpc',
  'hellopress',
  'phpmyadmin',
  'phpunit',
  '/vendor/',
  '/cgi-bin/',
  '/.git',
  '/.env',
  '/.aws',
  '/.well-known/', // ACME / host infra, not product API
];

// Path suffixes (extensions) the API never serves — web-shell / CMS / dump probes.
const NOISE_SUFFIXES = ['.php', '.asp', '.aspx', '.jsp', '.cgi', '.env', '.bak', '.sql', '.git', '.xml'];

// Exact non-API infrastructure paths (host/browser chrome, not product endpoints).
const NOISE_EXACT = new Set(['', '/', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/metrics']);

/** Normalise a path: lowercase, strip the query string + a trailing slash (keep root). */
function normalize(path: string | null | undefined): string {
  let p = (path || '').toLowerCase().trim();
  const q = p.indexOf('?');
  if (q >= 0) p = p.slice(0, q);
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
  return p;
}

/**
 * True when a request is internet background-noise (scanner / non-API infra),
 * NOT genuine application traffic. `method` is accepted for future heuristics;
 * classification is currently path-based.
 */
export function isProbeNoise(_method: string | null | undefined, path: string | null | undefined): boolean {
  const p = normalize(path);
  if (NOISE_EXACT.has(p)) return true;
  if (NOISE_SUFFIXES.some((s) => p.endsWith(s))) return true;
  if (NOISE_SUBSTRINGS.some((s) => p.includes(s))) return true;
  return false;
}

export interface TrafficSplit<T> {
  /** Genuine application-traffic rows. */
  app: T[];
  /** Internet background-noise (scanner / infra) rows. */
  probes: T[];
  /** Summed request count across the application rows. */
  appRequests: number;
  /** Summed request count across the probe rows. */
  probeRequests: number;
  /** Summed error count across the application rows. */
  appErrors: number;
}

/**
 * Split a server-metrics endpoint list into application traffic vs probe noise,
 * summing request / error counts so the caller can compute an honest
 * application-only error rate.
 */
export function splitEndpointTraffic<
  T extends { method: string; path: string; requests: number; errors: number },
>(endpoints: T[]): TrafficSplit<T> {
  const app: T[] = [];
  const probes: T[] = [];
  let appRequests = 0;
  let probeRequests = 0;
  let appErrors = 0;
  for (const e of endpoints) {
    if (isProbeNoise(e.method, e.path)) {
      probes.push(e);
      probeRequests += e.requests ?? 0;
    } else {
      app.push(e);
      appRequests += e.requests ?? 0;
      appErrors += e.errors ?? 0;
    }
  }
  return { app, probes, appRequests, probeRequests, appErrors };
}
