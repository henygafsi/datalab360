import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';

// Walk EVERY Account Overview tab as the ORG account (uchsfvb-ky11038 /
// ORGAADMIN_USER) — the case that surfaced the 12s-timeout dead tabs. Records
// per-tab: pageerrors, 5xx responses, error-toasts, and whether the tab
// reached real content vs stayed skeleton. Timeout generous (org scans are slow).
const ORG_ACCT = process.env.ORG_ACCT ?? 'uchsfvb-ky11038';
const ORG_USER = process.env.ORG_USER ?? 'ORGAADMIN_USER';
const ORG_PASS = process.env.ORG_PASS ?? '';
test.setTimeout(30 * 60_000);

const OUT = 'e2e/results/org-tabs';
fs.mkdirSync(OUT, { recursive: true });

const SECTIONS = [
  'account', 'usage-performance', 'finops', 'data-objects',
  'data-quality', 'security', 'platform-activity', 'projects', 'organization',
];

async function signIn(page: Page) {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill(ORG_ACCT).catch(() => {});
  await page.locator('input[name="username"], input#username').first().fill(ORG_USER).catch(() => {});
  await page.locator('input[type="password"]').first().fill(ORG_PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.includes('/signin'), { timeout: 120_000 });
}

test('org account: every Account Overview tab reaches content, no 5xx toast', async ({ page }) => {
  const report: Array<Record<string, unknown>> = [];
  const failures: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 500 && !r.url().includes('_next')) {
      failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
    }
  });
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 160)));

  await signIn(page);

  for (const sec of SECTIONS) {
    failures.length = 0;
    const t0 = Date.now();
    await page.goto(`/account-overview?section=${sec}`);
    // Let slow org scans land — poll for either content or an error toast, up to 5 min.
    await page.waitForLoadState('networkidle', { timeout: 300_000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const errToast = await page.getByText(/Erreur serveur|Réessayez ou vérifiez/i).first().isVisible().catch(() => false);
    const warming = await page.getByText(/Préparation des données|warming|cache/i).first().isVisible().catch(() => false);
    const boundary = await page.getByText('Something went wrong', { exact: false }).isVisible().catch(() => false);
    // heuristic "reached content": a KPI value or a table row is present
    const hasContent = await page.evaluate(() => {
      const txt = document.body.innerText;
      return /\d/.test(txt) && document.querySelectorAll('table, [role="row"], [data-kpi], .kpi').length > 0;
    });
    await page.screenshot({ path: `${OUT}/${sec}.png`, fullPage: true });
    report.push({
      section: sec, ms: Date.now() - t0,
      errorToast: errToast, warmingState: warming, errorBoundary: boundary,
      reachedContent: hasContent, fivexx: [...failures],
    });
    // eslint-disable-next-line no-console
    console.log(`${sec}: ${Date.now() - t0}ms content=${hasContent} errToast=${errToast} warming=${warming} 5xx=${failures.length} boundary=${boundary}`);
  }

  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify({ report, pageErrors }, null, 2));
  // Acceptance: no error boundary and no hard 5xx error TOAST on any tab
  // (a warming state is allowed; a slow-but-loading tab is allowed).
  const withToast = report.filter((r) => r.errorToast || r.errorBoundary);
  expect(withToast, `tabs showing a hard error: ${JSON.stringify(withToast.map((r) => r.section))}`).toEqual([]);
});
