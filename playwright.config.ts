import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://localhost:19000',
    channel: process.platform === 'win32' ? 'chrome' : undefined,
    screenshot: 'only-on-failure',
    trace: 'off',
    video: 'off',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'node scripts/start-e2e-web.mjs',
    url: 'http://localhost:19000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
