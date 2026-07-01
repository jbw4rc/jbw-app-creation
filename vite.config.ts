import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// On build we serve from a GitHub Pages project subpath
// (https://<user>.github.io/jbw-app-creation/); in dev we stay at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jbw-app-creation/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
}));
