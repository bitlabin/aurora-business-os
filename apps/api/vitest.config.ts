import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * NestJS relies on decorator metadata, which esbuild (vitest's default transformer) does not
 * emit. unplugin-swc transpiles with the same .swcrc the CLI scripts use.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    // e2e specs share one database, so files run one at a time (root-level option).
    fileParallelism: false,
    projects: [
      {
        plugins: [swc.vite({ module: { type: 'es6' } })],
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        plugins: [swc.vite({ module: { type: 'es6' } })],
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.e2e-spec.ts'],
          setupFiles: ['test/support/setup.ts'],
          globalSetup: ['test/support/global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**'] },
  },
});
