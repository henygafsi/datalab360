import { test, expect } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
test.setTimeout(20 * 60_000);

const PROJECTS = [
  { id: 'proj_01c59ad751d8', name: 'SEED_EXP_RLS_MODEL', tables: 3, edges: 2 },
  { id: 'proj_25447131ab9e', name: 'Wizard project',     tables: 2, edges: 1 },
];

test('the projects the user opens now show their model', async ({ page }) => {
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.pathname.includes('/signin'), { timeout: 90_000 });

  for (const p of PROJECTS) {
    const errs: string[] = [];
    const onErr = (e: Error) => errs.push(String(e).slice(0, 160));
    page.on('pageerror', onErr);

    await page.goto(`/explore-design?project_id=${p.id}&view=modeling`);
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(()=>{});
    expect(await page.getByText('Something went wrong', { exact: false }).isVisible().catch(()=>false)).toBe(false);

    const nodes = page.locator('.react-flow__node');
    // The canvas paints only after the ERD round-trip (~8-14s against real
    // Snowflake) and next dev compiles this route on first visit. If the first
    // paint loses that race, reload once — a user would too — rather than
    // weakening the assertion.
    const painted = async () => (await nodes.count()) >= p.tables;
    await expect.poll(painted, { timeout: 120_000, intervals: [3000] }).toBe(true).catch(() => {});
    if (!(await painted())) {
      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
      await expect.poll(painted, { timeout: 180_000, intervals: [3000] }).toBe(true);
    }
    const [n, e] = [await nodes.count(), await page.locator('.react-flow__edge').count()];
    console.log(`PROJECT ${p.name}: nodes=${n} edges=${e} pageErrors=${errs.length}`);
    expect(e).toBeGreaterThanOrEqual(p.edges);
    expect(errs).toEqual([]);
    await page.screenshot({ path: `e2e/results/model-${p.id}.png` });
    page.off('pageerror', onErr);
  }
});
