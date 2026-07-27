import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

// The extension is built by Vite with the crxjs plugin, which reads
// manifest.config.ts, bundles the service worker / content script / popup it
// references, and emits a loadable MV3 `dist/`. The `@` alias mirrors the app's
// import style so ported modules read the same.
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  plugins: [crx({ manifest })],
});
