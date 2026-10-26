import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    exclude: ['**/node_modules/**', '**/.git/**', '.audit-build-check/**', 'staging-runtime/**', '.next*/**'],
    setupFiles: ['./tests/setup-storage.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
