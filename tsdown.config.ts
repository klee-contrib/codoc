/// <reference types="node" />
import {defineConfig} from 'tsdown'

const isProd = process.env.npm_lifecycle_event === 'prepack'

export default defineConfig({
  entry: ['src/**/*.ts'],
  format: 'esm',
  outDir: 'dist',
  dts: !isProd,
  sourcemap: !isProd,
  clean: true,
  outExtensions: () => ({js: '.js', dts: '.d.ts'}),
})
