import { defineConfig } from 'tsup'

// One ESM bundle for `node dist/main.js`. Dependencies stay external, so
// PGlite finds its WASM and data files in node_modules.
export default defineConfig({
  entry: { main: 'src/main.ts' },
  format: 'esm',
  platform: 'node',
  target: 'node24',
  clean: true,
})
