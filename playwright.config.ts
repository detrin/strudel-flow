import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 5199;

// The test server keeps its Library here, never in ~/.strudelton.
process.env.STRUDELTON_HOME ??= join(tmpdir(), 'strudelton-e2e-library');

// Locally (`pnpm e2e`) and in CI, where a failure keeps its trace and
// gets one retry (the network fetches samples), and the report is kept.
const ci = Boolean(process.env.CI);
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  retries: ci ? 1 : 0,
  ...(ci ? { workers: 2 } : {}),
  use: {
    baseURL: `http://localhost:${port}`,
    trace: ci ? 'retain-on-failure' : 'off',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `pnpm exec vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    env: { STRUDELTON_HOME: process.env.STRUDELTON_HOME },
  },
});
