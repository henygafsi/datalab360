/**
 * studio-actionable-audit — ONE continuous walk over every Studio view in the
 * user's stated flow order (understand → dq → model → reporting → workflow →
 * access). For each view it:
 *   • inventories every interactive control (button / [role=button] / input /
 *     select / textarea) with its label, disabled state and aria hints,
 *   • loads it and expands its disclosures + switches its inner tabs (all safe,
 *     non-mutating) while capturing console/pageerror and every request status,
 *   • clicks the non-destructive AI-proposal / navigation controls and records
 *     whether each actually fired a backend call.
 *
 * Failures are classified into four buckets so the report is usable:
 *   fictive        — a control that fired NO request and changed NOTHING (bug)
 *   self_disable   — a 404/501 the insights layer disables itself on (not a bug)
 *   rbac           — a control disabled by useCanPerform (correct)
 *   error          — 4xx/5xx (other than 404/501) or a console/pageerror (bug)
 *
 * It never clicks a mutation (save/apply/delete/publish/grant/run …) — those
 * are inventoried with their disabled state only. Emits JSON to JOB_TMP.
 */
import { test, type Page, type Request } from '@playwright/test';
import * as fs from 'fs';

const USER = process.env.D360_USER ?? 'ORGAADMIN_USER';
const PASS = process.env.D360_PASS ?? '';
const ACCOUNT = process.env.D360_ACCOUNT ?? 'uchsfvb-ky11038';
const APP = process.env.APP ?? 'proj_576e16333cdf';
const OUT = process.env.JOB_TMP ?? 'e2e/results';
const SHOTS = process.env.SHOTS ?? '';

// The flow the user named, mapped to ?view= ids.
const VIEWS: Array<{ view: string; label: string }> = [
  { view: 'overview', label: 'Overview (understand)' },
  { view: 'sources', label: 'Sources (understand)' },
  { view: 'knowledge', label: 'Knowledge (understand)' },
  { view: 'quality', label: 'Quality (DQ)' },
  { view: 'model', label: 'Model' },
  { view: 'jobs', label: 'Jobs' },
  { view: 'reporting', label: 'Reporting (self-service)' },
  { view: 'workflows', label: 'Workflows (automation)' },
  { view: 'detection', label: 'Detection & alerts' },
  { view: 'governance', label: 'Access (self-service access control)' },
];

const MUTATION_RE =
  /\b(save|appl|delete|remove|revoke|drop|publish|deploy|grant|confirm|create|run now|execute|disconnect|sign out|log ?out|undo|reset|activate|pause|resume|approve|reject|import|point the|turn on|enable|disable)\b/i;
// Non-destructive proposal / navigation surfaces we DO exercise.
const PROBE_RE =
  /\b(ask the ai|ask ai|improve with ai|recommend|propose|suggest|interpret|explain|describe|check it against|open the process|open the panel|add a (column|link)|full sheet|full platform|details|view|show|more|expand|advanced)\b/i;

async function signIn(page: Page) {
  const csrf = (await (await page.request.get('/api/auth/csrf')).json()) as { csrfToken: string };
  const resp = await page.request.post('/api/auth/callback/credentials', {
    form: {
      csrfToken: csrf.csrfToken,
      account_name: ACCOUNT,
      username: USER,
      password: PASS,
      redirect: 'false',
      json: 'true',
    },
  });
  if (!resp.ok()) throw new Error(`signIn HTTP ${resp.status()}`);
  const s = (await (await page.request.get('/api/auth/session')).json()) as { user?: unknown };
  if (!s?.user) throw new Error('signIn: no session (backend rejected PAT?)');
}

async function settle(page: Page) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const crashed = await page
      .getByText('Something went wrong', { exact: false })
      .isVisible()
      .catch(() => false);
    if (crashed) break;
    const len = await page
      .locator('main')
      .first()
      .innerText()
      .then((t) => t.length)
      .catch(() => 0);
    if (len > 120) break;
    await page.waitForTimeout(800);
  }
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
}

type Control = { tag: string; label: string; disabled: boolean; aria: string };
type Probe = { label: string; bucket: string; detail: string };
type ViewReport = {
  view: string;
  label: string;
  crashed: boolean;
  emptyMain: boolean;
  controlCount: number;
  controls: Control[];
  loadErrors: string[];
  badResponses: string[];
  probes: Probe[];
};

test.describe.configure({ mode: 'serial' });
test.setTimeout(45 * 60_000);

test('studio actionable audit — walk the flow, classify every control', async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  const context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await context.newPage();
  const reports: ViewReport[] = [];

  // request/error buffers shared, cleared per interaction
  let reqLog: Array<{ url: string; method: string; status: number }> = [];
  const errLog: string[] = [];
  page.on('pageerror', (e) => errLog.push(`[pageerror] ${String(e.message).slice(0, 220)}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errLog.push(`[console] ${m.text().slice(0, 220)}`);
  });
  page.on('response', (r) => {
    const u = r.url();
    if (!/\/(api-proxy|api)\//.test(u)) return; // only app→backend calls
    reqLog.push({ url: u.replace(/^https?:\/\/[^/]+/, ''), method: r.request().method(), status: r.status() });
  });

  const isBackend = (r: Request) => /\/(api-proxy|api)\//.test(r.url());

  try {
    await signIn(page);

    for (const { view, label } of VIEWS) {
      const rep: ViewReport = {
        view,
        label,
        crashed: false,
        emptyMain: false,
        controlCount: 0,
        controls: [],
        loadErrors: [],
        badResponses: [],
        probes: [],
      };
      errLog.length = 0;
      reqLog = [];

      await page.goto(`/studio/apps/${APP}?view=${view}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await settle(page);
      await page.waitForTimeout(2500); // let async KPI/AI strips resolve

      rep.crashed = await page
        .getByText('Something went wrong', { exact: false })
        .isVisible()
        .catch(() => false);
      const mainText = await page.locator('main').first().innerText().catch(() => '');
      rep.emptyMain = mainText.trim().length < 120;

      // ---- inventory every interactive control on this view ----
      const controls = await page
        .locator('main button, main [role="button"], main input, main select, main textarea')
        .evaluateAll((els) =>
          els.map((el) => {
            const e = el as HTMLElement;
            const tag = e.tagName.toLowerCase();
            const label = (
              e.getAttribute('aria-label') ||
              e.textContent ||
              (e as HTMLInputElement).placeholder ||
              (e as HTMLInputElement).name ||
              ''
            )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 60);
            const aria = ['aria-pressed', 'aria-expanded', 'aria-disabled', 'role', 'title']
              .map((a) => (e.getAttribute(a) ? `${a}=${e.getAttribute(a)}` : ''))
              .filter(Boolean)
              .join(' ');
            const disabled =
              (e as HTMLButtonElement).disabled === true || e.getAttribute('aria-disabled') === 'true';
            return { tag, label, disabled, aria };
          }),
        )
        .catch(() => [] as Control[]);
      rep.controls = controls.filter((c) => c.label || c.tag !== 'button');
      rep.controlCount = rep.controls.length;

      // load-time errors + bad responses captured so far
      rep.loadErrors = [...new Set(errLog)];
      rep.badResponses = [
        ...new Set(reqLog.filter((r) => r.status >= 400).map((r) => `${r.status} ${r.method} ${r.url}`)),
      ];

      // ---- exercise the safe, non-destructive PROBE controls ----
      const clickable = page.locator('main button:enabled, main [role="button"], main [role="tab"]');
      const n = await clickable.count().catch(() => 0);
      const probedLabels = new Set<string>();
      for (let i = 0; i < n && rep.probes.length < 14; i++) {
        const el = clickable.nth(i);
        const raw = (await el.innerText().catch(() => '')) || (await el.getAttribute('aria-label').catch(() => '')) || '';
        const lab = raw.replace(/\s+/g, ' ').trim().slice(0, 48);
        if (!lab || probedLabels.has(lab)) continue;
        if (MUTATION_RE.test(lab)) continue;
        const isTab = (await el.getAttribute('role').catch(() => '')) === 'tab';
        if (!isTab && !PROBE_RE.test(lab)) continue;
        probedLabels.add(lab);

        errLog.length = 0;
        reqLog = [];
        const before = mainText.length;
        const nav = page.url();
        let fired: { url: string; method: string; status: number } | undefined;
        const waitReq = page
          .waitForResponse((r) => isBackend(r), { timeout: 3500 })
          .then((r) => {
            fired = { url: r.url().replace(/^https?:\/\/[^/]+/, ''), method: r.request().method(), status: r.status() };
          })
          .catch(() => {});
        await el.click({ timeout: 4000 }).catch(() => {});
        await waitReq;
        await page.waitForTimeout(700);

        const afterText = await page.locator('main').first().innerText().catch(() => '');
        const domChanged = Math.abs(afterText.length - before) > 40 || page.url() !== nav;
        const consoleErr = errLog.find((e) => e.startsWith('[pageerror]')) || '';

        let bucket = 'wired';
        let detail = '';
        if (consoleErr) {
          bucket = 'error';
          detail = consoleErr;
        } else if (fired) {
          if (fired.status === 404 || fired.status === 501) {
            bucket = 'self_disable';
            detail = `${fired.status} ${fired.url}`;
          } else if (fired.status >= 400) {
            bucket = 'error';
            detail = `${fired.status} ${fired.method} ${fired.url}`;
          } else {
            bucket = 'wired';
            detail = `${fired.status} ${fired.url}`;
          }
        } else if (isTab || domChanged) {
          bucket = 'wired';
          detail = domChanged ? 'ui-only (dom changed, no fetch)' : 'tab';
        } else {
          bucket = 'fictive';
          detail = 'no request, no dom change';
        }
        rep.probes.push({ label: lab, bucket, detail });
      }

      if (SHOTS) await page.screenshot({ path: `${SHOTS}/audit-${view}.png`, fullPage: true }).catch(() => {});
      reports.push(rep);
      console.log(
        `[${view}] controls=${rep.controlCount} crashed=${rep.crashed} empty=${rep.emptyMain} ` +
          `loadErr=${rep.loadErrors.length} bad=${rep.badResponses.length} ` +
          `probes: ${rep.probes.map((p) => `${p.label}→${p.bucket}`).join(', ')}`,
      );
    }
  } finally {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/studio-audit.json`, JSON.stringify(reports, null, 2));
    // compact summary to stdout
    const flat = reports.flatMap((r) => [
      ...(r.crashed ? [`${r.view}: CRASH`] : []),
      ...(r.emptyMain ? [`${r.view}: EMPTY main`] : []),
      ...r.loadErrors.map((e) => `${r.view}: load ${e}`),
      ...r.badResponses.map((b) => `${r.view}: resp ${b}`),
      ...r.probes.filter((p) => p.bucket === 'fictive' || p.bucket === 'error').map((p) => `${r.view}: ${p.bucket} "${p.label}" — ${p.detail}`),
    ]);
    console.log('\n===== STUDIO AUDIT — bugs to fix (fictive/error/crash/empty) =====');
    console.log(flat.length ? flat.join('\n') : '(none)');
    console.log(`\nfull report → ${OUT}/studio-audit.json`);
    await context.close();
  }
});
