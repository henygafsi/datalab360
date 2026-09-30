/**
 * studio-modeling.spec.ts — the modeling deep dive.
 *
 *   D360_PASS=$(grep -m1 '^PAT:' apps/data360/.env | awk '{print $2}') \
 *     npx playwright test e2e/studio-modeling.spec.ts --project=demo-video
 *
 * M1 the relations of a hub table are capped so the LINK builder stays
 *    reachable: a "show all N relations" toggle appears and "Add a link"
 *    sits right under the (short) list.
 * M2 the relation rows are deduplicated — the same join is not listed twice.
 * (thread C — CLS in governance — is added below once built.)
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const PASS = process.env.D360_PASS ?? '';
const APP = 'proj_576e16333cdf'; // 10-source snowflaked star

let context: BrowserContext;
let page: Page;

async function login(p: Page) {
  await p.goto('/signin', { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-ky11038');
  await p.locator('input[name="username"], input#username').first().fill('ORGAADMIN_USER');
  await p.locator('input[type="password"]').first().fill(PASS);
  await p.locator('button[type="submit"]').first().click();
  const d = Date.now() + 90_000;
  for (;;) {
    const s = await p.request.get('/api/auth/session').then((r) => r.json()).catch(() => null);
    if (s?.user?.access_token) return;
    if (Date.now() > d) throw new Error('login timeout');
    await p.waitForTimeout(1200);
  }
}

async function openFact(p: Page) {
  await p.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
  await p.getByRole('tab', { name: 'Model' }).click();
  // wait for the node to actually render (cold canvas can exceed a fixed wait)
  const node = p.getByText('FACT_TRANSACTIONS', { exact: false }).first();
  await node.waitFor({ state: 'visible', timeout: 45_000 });
  await node.click();
  // the inspector aside with Relations
  await p.locator('aside').filter({ hasText: /Relations/i }).first().waitFor({ timeout: 30_000 });
}

test.describe.configure({ mode: 'serial', timeout: 240_000 });

test.beforeAll(async ({ browser }) => {
  test.skip(!PASS, 'D360_PASS required');
  context = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  page = await context.newPage();
  await login(page);
});
test.afterAll(async () => {
  await context?.close();
});

test('M1 — relations are capped and the link builder is reachable', async () => {
  await openFact(page);
  const aside = page.locator('aside').filter({ hasText: /Relations/i }).first();
  // the cap toggle appears for a hub table with many relations
  await expect(aside.getByRole('button', { name: /show all \d+ relations/i })).toBeVisible();
  // linking is offered as its own labelled action, not buried
  await expect(aside.getByText(/^Add a link$/i)).toBeVisible();
  await expect(aside.getByLabel(/Related table/i)).toBeVisible();
});

test('M2 — the relation list is deduplicated', async () => {
  const aside = page.locator('aside').filter({ hasText: /Relations/i }).first();
  // expand to the full (deduped) list
  await aside.getByRole('button', { name: /show all \d+ relations/i }).click();
  // FACT_TRANSACTIONS → DIM_STORES.STORE_ID appeared TWICE before the fix
  const storesRel = aside.locator('li', { hasText: /→\s*DIM_STORES\.STORE_ID/i });
  await expect(storesRel).toHaveCount(1);
});

test('M3 — column masking (CLS) is a real governance action', async () => {
  await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Access' }).click();
  await expect(page.getByText(/Column masking \(CLS\)/i)).toBeVisible({ timeout: 60_000 });
  // mask an arbitrary column by name (masking often targets PII, not RLS candidates)
  await page.getByLabel('Column to mask').fill('EMAIL');
  await page.getByRole('button', { name: /^Mask$/ }).click();
  await expect(page.getByRole('button', { name: /Stop masking EMAIL/i })).toBeVisible();
  // the honest limits are stated, not hidden
  await expect(page.getByText(/adapt the column type before applying/i)).toBeVisible();
});

test('M5 — the target star draws its relations as edges', async () => {
  await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Model' }).click();
  await page.locator('.react-flow').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  // target mode returned edges:[] before — now the real target↔target
  // relations must be drawn (at least one edge path)
  await expect(page.locator('.react-flow__edge').first()).toBeVisible({ timeout: 20_000 });
});

test("M6 — the right bar leads with the table's meaning, not only technical", async () => {
  await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Model' }).click();
  const node = page.getByText('FACT_TRANSACTIONS', { exact: false }).first();
  await node.waitFor({ state: 'visible', timeout: 45_000 });
  await node.click();
  const aside = page.locator('aside').filter({ hasText: /Relations/i }).first();
  await aside.waitFor({ timeout: 30_000 });
  await expect(aside.getByText(/What this table means/i)).toBeVisible();
});

test('M7 — Add-a-column translates a description to SQL with AI', async () => {
  await openFact(page);
  const aside = page.locator('aside').filter({ hasText: /Relations/i }).first();
  await aside.getByRole('button', { name: 'Add a column', exact: true }).click();
  await expect(aside.getByText(/let the AI write the SQL/i)).toBeVisible();
  await aside.getByLabel('Name', { exact: true }).fill('MARGIN_PCT');
  await aside
    .getByLabel('Describe the column in words')
    .fill('margin = (net_amount - cost) / net_amount');
  const reqP = page.waitForRequest(
    (r) => r.url().includes('/model/derived-column') && r.method() === 'POST',
    { timeout: 30_000 },
  );
  await aside.getByRole('button', { name: /Translate with AI/i }).click();
  const body = (await reqP).postData() ?? '';
  expect(body).toContain('natural_language');
  expect(body.toLowerCase()).toContain('margin');
  expect(body).toMatch(/"confirm":\s*false/);
});

test('M4 — masking reaches the plan request (columns_masked)', async () => {
  // self-contained: land on Access, mask EMAIL, then map a principal
  await page.goto(`/studio/apps/${APP}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: 'Access' }).click();
  await expect(page.getByText(/Column masking \(CLS\)/i)).toBeVisible({ timeout: 60_000 });
  await page.getByLabel('Column to mask').fill('EMAIL');
  await page.getByRole('button', { name: /^Mask$/ }).click();
  const sel = page
    .locator('select')
    .filter({ has: page.locator('option', { hasText: /no access/i }) })
    .first();
  await sel.selectOption({ index: 1 });
  const reqP = page.waitForRequest(
    (r) => r.url().includes('/access/plan') && r.method() === 'POST',
    { timeout: 30_000 },
  );
  await page.getByRole('button', { name: /Prepare the change/i }).click();
  const body = (await reqP).postData() ?? '';
  expect(body).toContain('columns_masked');
  expect(body).toContain('EMAIL');
});
