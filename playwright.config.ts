import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: 'http://127.0.0.1:3777',
  },
  webServer: {
    command:
      // RATE_LIMIT_PER_MIN raised well above the 60/min default: the web UI now fires more
      // requests per interaction (goals list/detail/check-ins alongside todos), and the whole
      // suite runs inside one rate-limit window.
      'API_TOKEN=e2e-token-e2e-token-e2e OWNER_PASSWORD=e2e-owner-password NODE_ENV=test DB_PATH=/tmp/dueday-e2e.db PORT=3777 RATE_LIMIT_PER_MIN=2000 pnpm tsx src/index.ts',
    url: 'http://127.0.0.1:3777/health',
    reuseExistingServer: false,
  },
})
