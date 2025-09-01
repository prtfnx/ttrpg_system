import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import wasmPack from 'vite-plugin-wasm'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), wasmPack()],
  server: {
    fs: {
      allow: ['..']
    }
  },
  build: {
    target: 'esnext',
    minify: 'terser', // Better minification for production
    sourcemap: false, // Disable source maps for production
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
          protocol: ['./src/protocol/clientProtocol.ts', './src/protocol/message.ts']
        }
      }
    }
  }
})
