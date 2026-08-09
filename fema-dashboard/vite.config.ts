import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from a GitHub Pages project subpath on build; root in dev.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jbw-app-creation/fema/' : '/',
  plugins: [react()],
  server: { port: 5174, host: true },
}));
