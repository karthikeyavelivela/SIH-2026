import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Phase 7.1 — client test suite, previously zero files. Vitest (not Jest)
// specifically because it shares esbuild/Vite's transform pipeline with no
// extra Babel config needed for TSX, and its jsdom + watch-mode DX is a
// closer match to what a Next.js App Router codebase needs than ts-jest's
// slower per-file transform would be here.
export default defineConfig({
  plugins: [react()],
  // The project tsconfig sets "jsx": "preserve" (Next.js owns the real
  // transform via SWC at build time) — esbuild's own default JSX mode is
  // classic, which needs `React` in scope. Forcing automatic here is the
  // documented Vite workaround so component test files don't each need an
  // explicit `import React from 'react'` just to satisfy the test runner.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    css: false,
  },
});
