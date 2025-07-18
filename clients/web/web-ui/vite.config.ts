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
    target: 'esnext'
  }
})
