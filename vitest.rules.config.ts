import { defineConfig } from 'vitest/config';

// The rules suite talks to the emulator over the network and is slower than the
// pure-logic tests, so it runs on its own and stays out of the deploy gate.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/rules.test.ts'],
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
