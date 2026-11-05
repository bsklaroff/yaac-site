import { defineConfig } from 'drizzle-kit'

// Config for `drizzle-kit generate`, which diffs src/db/schema.ts against the
// ./drizzle snapshots and emits a new migration dir. drizzle-kit loads the
// schema with plain-Node resolution, which can't map the `#*` import
// targets to .ts sources, so keep it free of runtime `#` imports.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
})
