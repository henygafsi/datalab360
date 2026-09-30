import { test } from '@playwright/test';
const USER='HAHA', PASS=process.env.D360_PASS||'', ACCOUNT='uchsfvb-HAHA';
test('ed erd sources', async ({ page }) => {
  test.setTimeout(150000);
  const errs:string[]=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto('/signin');
  await page.locator('input[name="account_name"], input#account_name').first().fill(ACCOUNT).catch(()=>{});
  await page.locator('input[name="username"], input#username').first().fill(USER).catch(()=>{});
  await page.locator('input[type="password"]').first().fill(PASS);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(u=>!u.pathname.includes('/signin'),{timeout:90000});
  await page.goto('/explore-design?project_id=proj_01c59ad751d8&view=catalog',{waitUntil:'networkidle'}).catch(()=>{});
  await page.waitForTimeout(7000);
  await page.screenshot({ path:'/Users/datalab360/.claude/jobs/3f5bfc4a/tmp/erd-catalog.png', fullPage:false });
  // click a source node (RETAIL_DW or a source card in the graph)
  const node = page.getByText('RETAIL_DW', {exact:false}).first();
  if (await node.count()){ await node.click().catch(()=>{}); await page.waitForTimeout(4000); await page.screenshot({ path:'/Users/datalab360/.claude/jobs/3f5bfc4a/tmp/erd-source-select.png', fullPage:false }); }
  console.log('ERRS:', errs.length);
});
