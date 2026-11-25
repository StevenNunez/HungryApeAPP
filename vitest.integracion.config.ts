import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Tests against the real Supabase project (demo businesses only). */
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/integracion/**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
