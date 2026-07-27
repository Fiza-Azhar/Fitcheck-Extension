import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests run in plain Node — the matcher and other pure modules need no
// browser. Tests that touch `chrome.*` or the DOM stub those explicitly. The `@`
// alias matches vite.config.ts so imports resolve identically in tests. It is
// derived from import.meta.url (not __dirname) so it is correct under ESM.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
