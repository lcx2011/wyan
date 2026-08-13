import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['tests/**/.superpowers/**', '**/.superpowers/**', '**/dist*/**', '**/node_modules/**'],
    deps: {
      optimizer: {
        web: {
          enabled: true,
          include: [
            '@mui/material',
            '@mui/material/styles',
            '@mui/material/CssBaseline',
            '@mui/system',
            '@emotion/react',
            '@emotion/styled',
            '@emotion/cache',
          ],
        },
      },
    },
    typecheck: {
      enabled: true,
      include: ['tests/**/*.test.ts'],
    },
    coverage: {
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
