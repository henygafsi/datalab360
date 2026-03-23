import { test } from '@playwright/test';

test('inspect signin page 2', async ({ page }) => {
  await page.goto('http://localhost:3000/signin');
  await page.waitForTimeout(4000);
  
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => ({
      name: i.getAttribute('name'),
      id: i.getAttribute('id'),
      type: i.getAttribute('type'),
      placeholder: i.getAttribute('placeholder'),
    }));
  });
  console.log('INPUTS_FOUND:', JSON.stringify(inputs));
  
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => ({
      text: b.textContent?.trim().slice(0, 40),
      type: b.getAttribute('type'),
    }));
  });
  console.log('BUTTONS_FOUND:', JSON.stringify(buttons));
  
  const pageTitle = await page.title();
  console.log('PAGE_TITLE:', pageTitle);
  
  // Check text content
  const bodyText = await page.evaluate(() => document.body.innerText.trim().slice(0, 300));
  console.log('BODY_TEXT:', bodyText);
  
  await page.screenshot({ path: '/tmp/signin_debug.png' });
  console.log('SCREENSHOT_SAVED');
});
