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
  outputDir: './e2e/results',
});
