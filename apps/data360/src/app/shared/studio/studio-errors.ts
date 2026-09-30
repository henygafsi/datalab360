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
  /**
   * true ⇒ a DATA POLICY refused this read. Nothing is broken and no budget was
   * spent: the governance the account asked for is doing its job.
   *
   * This is a third category on purpose. Measured 2026-09-29 on
   * DATA360_LITE.ENTREPRISE_TEST: with an aggregation policy on DIM_CUSTOMER, a
   * DATA_VIEWER opening the customer table gets "Aggregation policy violation:
   * aggregation required" — rendered, until now, as a failure. A reader then
   * believes the product is broken, when in fact they are being correctly told
   * that this table may only be read in aggregate. Governance that reads as a
   * crash teaches people to distrust it.
   */
  governed: boolean;
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
 * A warehouse policy refusing a read, in the exact words it uses. Verified
 * against live refusals on 2026-09-29:
 *   aggregation → "Aggregation policy violation: aggregation required"
 *   projection  → "The following columns are restricted by a Projection Policy"
 * Each entry returns the sentence the READER needs: what the rule is, and what
 * they can still do — never a dead end.
 */
const POLICY_REFUSALS: Array<[RegExp, string]> = [
  [
    /aggregation policy|aggregation required|minimum group size|min_group_size/i,
    'This table can only be read in aggregate. Individual rows are protected, so ask for a total, an average or a count by group rather than a list — the same question still gets an answer.',
  ],
  [
    /projection policy|restricted by a projection/i,
    'Some of the columns requested are protected and cannot be selected. Choose the other columns — or ask an administrator for access to these — and the rest of the query works unchanged.',
  ],
  [
    /row access policy|masking policy/i,
    'A data policy applies to this table, so what you see is limited to your role. This is the account’s governance working as configured, not an error.',
  ],
];

/**
 * The STRUCTURED codes a policy refusal carries (backend, 2026-09-29). These are
 * the trigger; the regexes above are the fallback for anything that reaches us
 * as raw warehouse text. Keying on the code first means a reworded server
 * message can never silently turn a governed refusal back into a red error.
 *
 * They are 403 by design, not 500 — a policy doing its job is not a failure.
 */
const POLICY_CODES: Record<string, string> = {
  AGGREGATE_ONLY_BY_POLICY: POLICY_REFUSALS[0][1],
  COLUMN_RESTRICTED_BY_POLICY: POLICY_REFUSALS[1][1],
  COLUMN_MASKED_BY_POLICY: POLICY_REFUSALS[2][1],
};

/** The policy sentence for a refusal, or null when no policy is involved. */
export function policyRefusal(message: string, code?: string): string | null {
  if (code && POLICY_CODES[code]) return POLICY_CODES[code];
  for (const [re, said] of POLICY_REFUSALS) if (re.test(message)) return said;
  return null;
}

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

  // A policy refusal is checked FIRST: it is neither a defect nor a budget, and
  // reading it as either sends the user to the wrong remedy (a bug report, or an
  // administrator asked to raise a quota that was never the problem).
  // the backend's own `hint` says how the data CAN still be read; prefer it when
  // present, since it is specific to the policy that actually refused.
  const governedText = policyRefusal(raw, code);
  if (governedText) {
    const hint = typeof (o as { hint?: unknown }).hint === 'string' ? (o as { hint?: string }).hint : '';
    return { text: hint ? `${governedText} ${hint}` : governedText, budget: false, governed: true, raw, code };
  }

  const spoken = humanize(raw);
  if (spoken !== raw) return { text: spoken, budget: false, governed: false, raw, code };

  if (budget) {
    const why =
      o.blocked_by === 'warehouse_credits' || /quota|resource monitor|cannot be resumed/i.test(raw)
        ? 'The compute budget for this account is used up, so no new question can be answered right now.'
        : 'This step is beyond what the free preview covers.';
    return {
      text: `${why}${o.next_step ? ` ${o.next_step}` : ' An account administrator can raise it — nothing here is broken.'}`,
      budget: true,
      governed: false,
      raw,
      code,
    };
  }
  return { text: raw, budget: false, governed: false, raw, code };
}
