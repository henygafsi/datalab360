/**
 * studio-errors — one reading of a failure, for every Studio surface.
 *
 * Why this is shared and not local: the same coercion was written three
 * times (job editor, rails, AI proposal) and was MISSING in the one place
 * that mattered most — the report tiles. The batch route declares
 * `error?: string` but sends an object, so rendering it as a JSX child
 * threw React #31 and blanked the whole application. One failing widget
 * took the page with it, which is how a spent budget came to look like a
 * broken product.
 *
 * The second job here is telling those two apart. The backend states it:
 * `is_product_failure: false` with `blocked_by` naming the wall. A surface
 * that says "something went wrong" when the real answer is "the budget for
 * this account is spent, an administrator can raise it" sends the reader
 * hunting for a bug that does not exist.
 */

export interface Failure {
  /** what the reader is told — a sentence, never an object */
  text: string;
  /** true ⇒ nothing is broken; a limit was reached */
  budget: boolean;
  /** the untouched server text, for a title attribute or a details block */
  raw?: string;
  code?: string;
}

/** Flatten anything into text safe to render. */
export function asText(v: unknown, fallback = 'This did not go through.'): string {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as { message?: string; detail?: unknown; error_code?: string };
    if (typeof o.message === 'string' && o.message) return o.message;
    if (typeof o.detail === 'string' && o.detail) return o.detail;
    if (o.detail && typeof o.detail === 'object') return asText(o.detail, fallback);
    if (o.error_code) return o.error_code;
    try {
      return JSON.stringify(v).slice(0, 200);
    } catch {
      return fallback;
    }
  }
  return String(v);
}

/**
 * Server messages written for whoever calls the API, rewritten for whoever
 * uses the product. A reader was being told
 *   "run POST /studio/understand first (inline `understanding` or a draft holding one)"
 * which names a route they cannot call and a payload they will never see.
 * The sentence must say what THEY do next.
 */
const DEV_SPEAK: Array<[RegExp, string]> = [
  [
    /POST\s+\/studio\/understand/i,
    'This application has not analysed its data yet. Choose its sources, then run the analysis — the report is written from what that analysis finds.',
  ],
  [
    /\/studio\/(targets|jobs)\/propose/i,
    'There is no target model yet. Propose one from the analysed sources, then the loads can be built.',
  ],
  [
    /no sources recorded|sources.*not recorded/i,
    'No source is attached to this application yet — start by choosing the tables it should read.',
  ],
  [
    /SUGGEST_INPUT_REQUIRED|pass candidates\[\]/i,
    'Pick at least one table — or a database to scan — before the AI can rank them.',
  ],
];

/** Rewrite an API-facing sentence into a product-facing one. */
export function humanize(message: string): string {
  for (const [re, said] of DEV_SPEAK) if (re.test(message)) return said;
  return message;
}

const BUDGET_CODES = new Set([
  'RESOURCE_LIMIT_EXCEEDED',
  'PREVIEW_LIMIT_REACHED',
  'PREVIEW_OP_CREDIT_GATED',
]);

/**
 * Read a failure the way the product should say it: a plain sentence, plus
 * whether this is a limit rather than a defect. Vendor internals (warehouse
 * names, driver codes, query ids) stay in `raw` — they belong in an admin
 * view or a tooltip, never in the business sentence.
 */
export function readFailure(v: unknown): Failure {
  const raw = asText(v);
  const o = (typeof v === 'object' && v !== null ? v : {}) as {
    error_code?: string;
    blocked_by?: string;
    is_product_failure?: boolean;
    next_step?: string;
  };
  const code = o.error_code;
  const budget =
    o.is_product_failure === false ||
    (code ? BUDGET_CODES.has(code) : false) ||
    /resource monitor|exceeded its quota|cannot be resumed/i.test(raw);

  const spoken = humanize(raw);
  if (spoken !== raw) return { text: spoken, budget: false, raw, code };

  if (budget) {
    const why =
      o.blocked_by === 'warehouse_credits' || /quota|resource monitor|cannot be resumed/i.test(raw)
        ? 'The compute budget for this account is used up, so no new question can be answered right now.'
        : 'This step is beyond what the free preview covers.';
    return {
      text: `${why}${o.next_step ? ` ${o.next_step}` : ' An account administrator can raise it — nothing here is broken.'}`,
      budget: true,
      raw,
      code,
    };
  }
  return { text: raw, budget: false, raw, code };
}
