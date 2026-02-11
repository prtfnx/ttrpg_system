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
      rollupOptions: {
        input: {
          main: './index.html',
          integration: './src/integration.tsx'
        },
        output: {
          entryFileNames: '[name]-[hash].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          // Manual chunks for better caching
          manualChunks: {
            vendor: ['react', 'react-dom'],
            protocol: ['./src/lib/websocket/clientProtocol.ts', './src/lib/websocket/message.ts']
          }
        }
      }
    }
  };
})
