import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1920, height: 1080 },
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
    },
    launchOptions: {
      slowMo: 600, // slow down actions so the video looks natural
    },
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'demo-video',
      use: { browserName: 'chromium' },
    },
  ],
  // Playwright WIPES outputDir at run start. It used to be e2e/results —
  // the same directory every spec writes its evidence screenshots to, so any
  // no---output run (the all-pages audit, typically) deleted the whole
  // gallery (live-caught twice on 2026-07-10/11). Artifacts now live in
  // their own throwaway dir; e2e/results is for screenshots only.
  outputDir: './e2e/.artifacts',
});
