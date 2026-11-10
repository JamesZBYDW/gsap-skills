import { defineConfig } from 'vitest/config';

// The Worker's logic lives in src/portal.ts behind structural interfaces, so
// it is tested in plain Node; src/index.ts only binds it to the runtime.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
