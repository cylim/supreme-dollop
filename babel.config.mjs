import styleXPlugin from '@stylexjs/babel-plugin'

export default {
  presets: [
    ['@babel/preset-react', { runtime: 'automatic' }],
    ['@babel/preset-typescript', { allExtensions: true, isTSX: true }],
  ],
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
}
