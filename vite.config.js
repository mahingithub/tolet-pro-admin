import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone admin console. Runs on :5174 in dev so it never collides with the
// public app (:5173). The backend allow-lists this origin via ADMIN_CORS_ORIGINS.
export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    port: 5174,
    strictPort: true,
  },
  preview: {
    port: 5174,
    strictPort: true,
  },
})
