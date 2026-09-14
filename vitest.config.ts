import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}', 'convex/**/*.test.ts'],
    environment: 'edge-runtime',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['convex/**/*.ts', 'shared/**/*.ts'],
      exclude: [
        'convex/_generated/**',
        'convex/**/*.test.ts',
        'convex/*.config.ts',
        'convex/schema.ts',
      ],
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 85,
        branches: 85,
      },
    },
    server: {
      deps: {
        inline: ['convex-test'],
      },
    },
  },
})
