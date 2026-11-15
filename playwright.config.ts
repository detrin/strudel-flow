import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const port = 5199;

// The test server keeps its Library here, never in ~/.strudelton.
process.env.STRUDELTON_HOME ??= join(tmpdir(), 'strudelton-e2e-library');

// End-to-end tests run locally only (`pnpm e2e`), never in CI.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
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
