import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3011',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.E2E_BROWSER_PATH || path.join(os.tmpdir(), 'chromium'),
      // Keep web security and site isolation enabled (unlike Lambda defaults).
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'],
      env: { ...process.env, LD_LIBRARY_PATH: [path.join(os.tmpdir(), 'cybershop-browser-libs/lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') },
    },
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'android-viewport-chromium', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'node e2e/stack.mjs',
    url: 'http://127.0.0.1:3011/login',
    reuseExistingServer: false,
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
