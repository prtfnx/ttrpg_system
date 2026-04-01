import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/vite-env.d.ts'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache'
    ]
  },
  resolve: {
    alias: {
      // Path aliases for test files
      '@': '/src',
      '@features': '/src/features',
      '@shared': '/src/shared',
      '@lib': '/src/lib',
      '@config': '/src/config',
      '@app': '/src/app',
      '@test': '/src/test',
      // During tests, resolve the dynamic WASM import path to a local test stub
      '/static/ui/wasm/ttrpg_rust_core.js': '/src/test/mocks/ttrpg_rust_core.mock.ts',
      // Mock WASM core module
      '../wasm/ttrpg_rust_core': '/src/test/mocks/wasm.mock.ts',
      '../../wasm/ttrpg_rust_core': '/src/test/mocks/wasm.mock.ts',
      // Mock react-toastify to avoid missing dependency errors
      'react-toastify': '/src/test/mocks/react-toastify.mock.ts'
    }
  }
});