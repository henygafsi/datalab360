// Same gate, same assertions as playwright.config.ts — minus the demo-video
// cosmetics (slowMo 600 + video recording) so the full battery fits a
// 10-minute foreground run. Used for the 2026-07 density-redesign gate.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1920, height: 1080 },
    actionTimeout: 15_000,
  },
  projects: [{ name: 'demo-video', use: { browserName: 'chromium' } }],
  outputDir: './e2e/.artifacts-fast',
});
