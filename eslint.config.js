import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

const sourceFiles = [
  'src/**/*.{ts,tsx}',
  'tests/**/*.{ts,tsx}',
  'packages/**/*.ts',
  '*.config.ts',
]

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'package-artifacts/**',
      'packages/*/dist/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    ...js.configs.recommended,
    files: sourceFiles,
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: sourceFiles,
  })),
  {
    files: sourceFiles,
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'none',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
    },
  },
  {
    // These engines intentionally use mutable model revision tokens to rebuild
    // memoized axes/caches. The generic dependency rule cannot model that contract.
    files: [
      'src/core/UltiGridViewport.tsx',
      'src/bi/UltiGridInsight.tsx',
    ],
    rules: {
      'react-hooks/exhaustive-deps': 'off',
    },
  },
)
