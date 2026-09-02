import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // A late console.* must not redden a green suite: vitest forwards console
    // output over RPC and a write landing after teardown is rejected into an
    // unhandled error. Same disarm the platform's own example apps use.
    disableConsoleIntercept: true,
    include: ['test/**/*.test.ts'],
  },
});
