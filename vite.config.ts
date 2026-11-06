import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
// On build we serve from a GitHub Pages project subpath
// (https://<user>.github.io/jbw-app-creation/); in dev we stay at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/jbw-app-creation/' : '/',
  plugins: [react()],
  // Independent apps share this build: the NBA apron tool at /, the NFL
  // sharp-money board at /nfl.html and the FEMA PA bid scanner at /fema.html.
  // They share nothing but the toolchain.
  build: {
    rollupOptions: {
      // Paths are relative to the Vite root, which avoids pulling @types/node
      // in just to call resolve(__dirname, ...).
      input: { main: 'index.html', nfl: 'nfl.html', fema: 'fema.html' },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
}));
