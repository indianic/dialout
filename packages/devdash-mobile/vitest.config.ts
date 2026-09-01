import { defineConfig } from 'vitest/config';

// Without a config here, vitest walks up and loads the repo root's, whose "@"
// alias points at the WEB app's src/ and whose include list never mentions this
// package. Mobile tests then run under the web app's resolution rules purely by
// coincidence of matching "src/**/*.test.ts" against this cwd.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
