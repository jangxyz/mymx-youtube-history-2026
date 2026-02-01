import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

export default defineConfig({
  plugins: [
    svelte({
      configFile: path.resolve('./svelte.config.js'),
    }),
  ],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // No code splitting for Electron - single bundle
        manualChunks: undefined,
      },
    },
  },
  resolve: {
    alias: {
      $lib: path.resolve('./src/renderer/lib'),
    },
  },
});
