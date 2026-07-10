import { test, expect, request as pwRequest } from '@playwright/test';
const PASS = process.env.D360_PASS ?? '';
const BACKEND = process.env.D360_BACKEND ?? 'http://localhost:8078';
test.setTimeout(20 * 60_000);

const PROJECTS = [
  { id: 'proj_01c59ad751d8', name: 'SEED_EXP_RLS_MODEL' },
  { id: 'proj_25447131ab9e', name: 'Wizard project' },
];

test('the projects the user opens now show their model', async ({ page }) => {
  // The backend ERD is the source of truth for what the canvas must paint —
  // fetch it per project instead of hardcoding node/edge counts, and assert
  // STRICT equality: a dropped table or a phantom (stale-event) edge both fail.
  const api = await pwRequest.newContext({ baseURL: BACKEND });
  const signinRes = await api.post('/signin', {
    data: { account_name: 'uchsfvb-HAHA', username: 'HAHA', password: PASS },
  });
  expect(signinRes.ok(), `backend /signin failed: ${signinRes.status()}`).toBe(true);
  const { access_token } = await signinRes.json();
  const auth = { Authorization: `Bearer ${access_token}` };

  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill('uchsfvb-HAHA').catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill('HAHA').catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u => !u.pathname.includes('/signin'), { timeout: 90_000 });

  for (const p of PROJECTS) {
    const erdRes = await api.get(`/explore-design/projects/${p.id}/erd`, { headers: auth });
    expect(erdRes.ok(), `GET /erd failed for ${p.id}: ${erdRes.status()}`).toBe(true);
    const erd = await erdRes.json();
    const expectedTables: number = (erd.tables ?? []).length;
    const expectedEdges: number = (erd.relationships ?? []).length;
    expect(expectedTables, `${p.name} has no saved model — seed data missing?`).toBeGreaterThan(0);

    const errs: string[] = [];
    const onErr = (e: Error) => errs.push(String(e).slice(0, 160));
    page.on('pageerror', onErr);

    await page.goto(`/explore-design?project_id=${p.id}&view=modeling`);
    await page.waitForLoadState('networkidle', { timeout: 120_000 }).catch(()=>{});
    expect(await page.getByText('Something went wrong', { exact: false }).isVisible().catch(()=>false)).toBe(false);

    const nodes = page.locator('.react-flow__node');
    const edges = page.locator('.react-flow__edge');
    // The canvas paints after the ERD round-trip (~8-14s against real Snowflake)
    // and late effects (event replay, mapping restore) can add/remove elements
    // for a while — poll until it EXACTLY matches the backend model. If the
    // first paint loses that race, reload once — a user would too — rather
    // than weakening the assertion.
    const painted = async () =>
      (await nodes.count()) === expectedTables && (await edges.count()) === expectedEdges;
    await expect.poll(painted, { timeout: 120_000, intervals: [3000] }).toBe(true).catch(() => {});
    if (!(await painted())) {
      await page.reload();
      await page.waitForLoadState('networkidle', { timeout: 90_000 }).catch(() => {});
      await expect.poll(painted, { timeout: 180_000, intervals: [3000] }).toBe(true);
    }
    const [n, e] = [await nodes.count(), await edges.count()];
    console.log(`PROJECT ${p.name}: nodes=${n}/${expectedTables} edges=${e}/${expectedEdges} pageErrors=${errs.length}`);
    expect(n, `${p.name}: canvas nodes must equal backend ERD tables`).toBe(expectedTables);
    expect(e, `${p.name}: canvas edges must equal backend ERD relationships`).toBe(expectedEdges);
    expect(errs).toEqual([]);
    await page.screenshot({ path: `e2e/results/model-${p.id}.png` });
    page.off('pageerror', onErr);
  }
  await api.dispose();
});
