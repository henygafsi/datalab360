import { test } from '@playwright/test';

test('rsc data debug', async ({ page }) => {
  // Capture the initial RSC data
  const nextFData: string[] = [];
  
  await page.addInitScript(() => {
    const origPush = (Array.prototype as any).push;
    (window as any).__next_f = new Proxy([], {
      set(target, prop, value) {
        if (prop === 'length') return true;
        target[prop as any] = value;
        if (Array.isArray(value)) {
          (window as any).__next_f_log = (window as any).__next_f_log || [];
          (window as any).__next_f_log.push(JSON.stringify(value).slice(0, 200));
        }
        return true;
      }
    });
  });
  
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(3000);
  
  const rscData = await page.evaluate(() => {
    return {
      nextF: ((window as any).__next_f || []).slice(0, 5).map((d: any) => JSON.stringify(d).slice(0, 150)),
      nextFLog: ((window as any).__next_f_log || []).slice(0, 5),
    };
  });
  
  console.log('RSC_DATA_F:');
  rscData.nextF.forEach((d: string) => console.log(' ', d));
  
  // Check what modules the RSC protocol is requesting
  const moduleRefs = await page.evaluate(() => {
    const nextF = (window as any).__next_f || [];
    const moduleRefs: string[] = [];
    for (const item of nextF) {
      if (Array.isArray(item) && item[0] === 1 && typeof item[1] === 'string') {
        // RSC module reference format: [1, "serialized RSC data"]
        const refs = item[1].match(/\["[a-z/-]+",\s*"[^"]*"\]/g) || [];
        moduleRefs.push(...refs.slice(0, 3));
      }
    }
    return moduleRefs.slice(0, 5);
  });
  
  console.log('MODULE_REFS:', JSON.stringify(moduleRefs));
});
