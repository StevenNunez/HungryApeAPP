import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests hit the real database: run them on purpose with `npm run test:integracion`
    exclude: ['tests/integracion/**', 'node_modules/**'],
  },
});
