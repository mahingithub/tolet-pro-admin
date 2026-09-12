/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Standalone admin console. Runs on :5174 in dev so it never collides with the
// public app (:5173). The backend allow-lists this origin via ADMIN_CORS_ORIGINS.
export default defineConfig({
  // ─── Tests ────────────────────────────────────────────────────────────────
  // `jsdom` rather than the default node environment: almost everything worth
  // testing here touches localStorage, geolocation or the DOM.
  //
  // `include` is narrow on purpose. The default glob picks up anything under
  // node_modules that happens to match, which turns a two-second run into a
  // minute of somebody else's tests.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    css: false,
  },

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
