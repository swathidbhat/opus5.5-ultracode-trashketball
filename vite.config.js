import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js alone is ~600 kB minified; one chunk is fine for a single-page game.
    chunkSizeWarningLimit: 900,
  },
});
