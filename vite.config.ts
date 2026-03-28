import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/generate': 'http://localhost:3000',
      '/chat': 'http://localhost:3000',
      '/upload-evidence': 'http://localhost:3000',
      '/test-ai': 'http://localhost:3000',
      '/debug': 'http://localhost:3000',
    },
  },
})
