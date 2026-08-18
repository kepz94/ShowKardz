import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Project Pages serve from /<repo>/, so the built assets need that base.
// `preview` gets it too — a preview server at a different base is not a preview
// of what ships, and the mismatch shows up as 404s on every asset.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/ShowKardz/' : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
}));
