import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  // Mirrors the "@/*" -> "./src/*" mapping in tsconfig.json. Without it any
  // test that touches app code (which imports via "@/lib/...") fails to
  // resolve, which is why tests previously only covered alias-free modules.
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'packages/devdash-shared/src/**/*.test.ts'],
  },
});
