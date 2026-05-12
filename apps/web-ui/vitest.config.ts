import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
              '**/index.ts',
              '**/*.module.css',
            ],
            thresholds: {
              lines: 30,
              functions: 30,
              branches: 25,
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
        plugins: [
          react(),
          // Allow importing JS files from public/wasm — Vite 7 blocks public/*.js imports by default.
          // Intercept the test file transform to replace the import path with a virtual module.
          {
            name: 'allow-public-wasm-js',
            enforce: 'pre' as const,
            transform(code: string, id: string) {
              if (id.endsWith('.wasm-test.ts') && code.includes('/wasm/')) {
                // Replace dynamic import of public WASM JS with a virtual module path
                return code.replace(
                  /import\(\/\* @vite-ignore \*\/ '\/wasm\/ttrpg_rust_core\.js'\)/g,
                  "import(/* @vite-ignore */ '/wasm-module/ttrpg_rust_core.js')"
                );
              }
            },
            resolveId(id: string) {
              if (id === '/wasm-module/ttrpg_rust_core.js') {
                return '\0virtual:wasm-entry';
              }
            },
            load(id: string) {
              if (id === '\0virtual:wasm-entry') {
                const filePath = path.resolve(__dirname, 'public/wasm/ttrpg_rust_core.js');
                let code = fs.readFileSync(filePath, 'utf-8');
                // Fix WASM binary URL: replace relative import.meta.url resolution with absolute path
                code = code.replace(
                  /new URL\('ttrpg_rust_core_bg\.wasm', import\.meta\.url\)/g,
                  "new URL('/wasm/ttrpg_rust_core_bg.wasm', location.origin)"
                );
                return code;
              }
            },
          },
        ],
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
