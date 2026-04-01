import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import wasmPack from 'vite-plugin-wasm';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isDevelopment = mode === 'development';
  
  return {
    base: '/static/ui/',
    plugins: [react(), wasmPack()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@features': path.resolve(__dirname, './src/features'),
        '@shared': path.resolve(__dirname, './src/shared'),
        '@lib': path.resolve(__dirname, './src/lib'),
        '@config': path.resolve(__dirname, './src/config'),
        '@app': path.resolve(__dirname, './src/app'),
      },
    },
    server: {
      fs: {
        allow: ['..']
      }
    },
    build: {
      target: 'esnext',
      minify: isDevelopment ? false : 'terser',
      sourcemap: isDevelopment,
      manifest: true,
      // wasm-bindgen JS glue is inherently ~130 KB gzipped — silence the false alarm
      chunkSizeWarningLimit: 550,
      rollupOptions: {
        input: {
          main: './index.html',
          integration: './src/integration.tsx'
        },
        output: {
          entryFileNames: '[name]-[hash].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          // Function form gives explicit routing per module — object form only seeds and
          // lets Rollup lump everything else into whichever chunk claimed the dep first.
          manualChunks(id) {
            // lucide-react is large and updates independently from React — own chunk
            if (id.includes('lucide-react')) return 'icons';
            // All other node_modules → vendor (stable, long cache lifetime)
            if (id.includes('node_modules')) return 'vendor';
            // WASM bridge + generated TS declarations — changes every Rust build
            // Must be assigned BEFORE features to avoid feature code bleeding in
            if (id.includes('/src/lib/wasm/')) return 'wasm';
            // Network/protocol layer without WASM mixed in
            if (id.includes('/src/lib/websocket/') || id.includes('/src/lib/api/')) return 'protocol';
            // Store is imported everywhere; give it its own chunk so it isn't
            // duplicated across feature chunks
            if (id.includes('/src/store')) return 'store';
          }
        }
      }
    }
  };
})
