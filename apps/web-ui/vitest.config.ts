import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/vite-env.d.ts',
        '**/index.ts',
        '**/*.module.css',
      ],
      thresholds: {
        lines: 30,
        functions: 30,
        branches: 25,
      },
    },
    // Workspace projects: jsdom (unit/component) + browser (real WASM integration)
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup.ts'],
          css: true,
          include: [
            'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
            'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
          ],
          exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'src/**/*.wasm-test.ts'],
        },
        resolve: {
          alias: {
            '@': '/src',
            '@features': '/src/features',
            '@shared': '/src/shared',
            '@lib': '/src/lib',
            '@config': '/src/config',
            '@app': '/src/app',
            '@test': '/src/test',
            'react-toastify': '/src/test/mocks/react-toastify.mock.ts',
            'react-rnd': '/src/test/mocks/react-rnd.mock.ts',
          },
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'browser',
          include: ['src/**/*.wasm-test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
        assetsInclude: ['**/*.wasm'],
        server: {
          fs: { strict: false },
        },
        resolve: {
          alias: {
            '@': '/src',
            '@features': '/src/features',
            '@shared': '/src/shared',
            '@lib': '/src/lib',
            '@config': '/src/config',
            '@app': '/src/app',
            '@test': '/src/test',
          },
        },
      },
      // ── browser-components: React components that need real browser APIs ──
      {
        plugins: [react()],
        test: {
          name: 'browser-components',
          include: ['src/**/*.browser-test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
          globals: true,
          setupFiles: ['./src/test/setup.browser.ts'],
        },
        resolve: {
          alias: {
            '@': '/src',
            '@features': '/src/features',
            '@shared': '/src/shared',
            '@lib': '/src/lib',
            '@config': '/src/config',
            '@app': '/src/app',
          },
        },
      },
    ],
  },
});
