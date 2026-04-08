import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
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
          coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
              'node_modules/',
              'src/test/',
              '**/*.d.ts',
              '**/*.config.*',
              '**/vite-env.d.ts',
            ],
            thresholds: {
              global: { branches: 80, functions: 80, lines: 80, statements: 80 },
            },
          },
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
            '/static/ui/wasm/ttrpg_rust_core.js': '/src/test/mocks/ttrpg_rust_core.mock.ts',
            '../wasm/ttrpg_rust_core': '/src/test/mocks/wasm.mock.ts',
            '../../wasm/ttrpg_rust_core': '/src/test/mocks/wasm.mock.ts',
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
            enabled: false,
            provider: 'playwright',
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
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
    ],
  },
});
