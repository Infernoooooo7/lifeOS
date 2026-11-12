import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3211);
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:5433/lifeos_test';

/**
 * End-to-end tests run against the production build (`npm run build` first) and a real PostgreSQL
 * database. Desktop runs everything; the phone profile runs the workflow and layout suites.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off', serviceWorkers: 'allow', launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /(workflows|layout)\.spec\.ts/ },
  ],
  webServer: {
    command: `npx prisma migrate deploy && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { DATABASE_URL, NODE_ENV: 'production' },
  },
});
