import { defineConfig, devices } from '@playwright/test'

try {
  process.loadEnvFile('.env.e2e.local')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 60_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'line',
  use: {
    baseURL: process.env.E2E_BASE_URL,
    // Traces can retain values entered into credential fields.
    trace: 'off',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    timezoneId: 'Asia/Kuala_Lumpur',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.E2E_BASE_URL?.startsWith('http://localhost:3000')
    ? {
        command: 'npx vite dev --host 127.0.0.1 --port 3000',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      }
    : undefined,
})
