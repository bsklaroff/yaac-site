import globals from 'globals'
import stylistic from '@stylistic/eslint-plugin'
import tseslint from 'typescript-eslint'

// Every route reads its input through `zv` (src/api/validator.ts), so the
// RPC client's types are the whole contract: a handler that reads the raw
// request would accept input `AppType` does not describe. The signature
// check (src/api/signed.ts) is the one sanctioned reader of raw bytes and
// headers, and carries inline disables.
const RELATIVE_PARENT = { group: ['..*'], message: 'Relative parent imports are not allowed; use "#…".' }

const RAW_REQUEST_READ = {
  selector: 'MemberExpression[object.property.name="req"][property.name=/^(json|text|arrayBuffer|blob|formData|parseBody|query|queries|param|header)$/]',
  message: 'Read request input through `zv` so the RPC types describe it (src/api/validator.ts).',
}

export default tseslint.config(
  { ignores: ['dist', 'public', 'drizzle'] },
  {
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
    ],
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [RELATIVE_PARENT] },
      ],
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'avoidEscape' }],
      '@stylistic/semi': ['error', 'never'],
      '@stylistic/comma-dangle': ['error', 'always-multiline'],
      '@stylistic/object-curly-spacing': ['error', 'always'],
      '@stylistic/array-bracket-spacing': ['error', 'never'],
      '@stylistic/no-trailing-spaces': ['error'],
      '@stylistic/arrow-parens': ['error', 'always'],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },

  // Only db opens the database, and only the validator wraps zValidator.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/db/**'],
    rules: {
      'no-restricted-syntax': ['error', RAW_REQUEST_READ],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [{ name: '@hono/zod-validator', message: 'Validate through `zv` (src/api/validator.ts).' }],
          patterns: [
            RELATIVE_PARENT,
            {
              regex: '^(@electric-sql/pglite|drizzle-orm)(/|$)',
              message: 'Only #db opens the database: read or write rows through its barrel.',
            },
            { regex: '^#db/.', message: 'Import the #db barrel, not the modules behind it.' },
          ],
        },
      ],
    },
  },
)
