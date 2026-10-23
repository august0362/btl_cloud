import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/integration/global-setup.ts'],
          // Một DB test dùng chung → chạy tuần tự trong một fork (ARCHITECTURE §A10.6).
          pool: 'forks',
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
