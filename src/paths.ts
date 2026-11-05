import path from 'node:path'

/** The repo root. This module sits one below it both as src/paths.ts and
 *  inside the dist/main.js bundle. */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, '..')

/** The landing page's static files. */
export const PUBLIC_DIR = path.join(PACKAGE_ROOT, 'public')

/** The checked-in migration SQL that drizzle-kit generates. */
export const MIGRATIONS_DIR = path.join(PACKAGE_ROOT, 'drizzle')
