import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import babel from '@rolldown/plugin-babel'
import styleXPlugin from '@stylexjs/babel-plugin'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: true,
    port: 3000,
  },
  plugins: [
    tanstackStart({
      spa: {
        enabled: true,
        prerender: { outputPath: '/index.html' },
      },
    }),
    viteReact(),
    babel({
      plugins: [
        [
          styleXPlugin,
          {
            runtimeInjection: false,
            dev: process.env.NODE_ENV !== 'production',
            test: false,
            unstable_moduleResolution: {
              type: 'commonJS',
              rootDir: process.cwd(),
            },
          },
        ],
      ],
    }),
  ],
})
