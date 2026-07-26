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
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: '^(?:\\.\\.?/)+(?:bi|demo|i18n|studio|utils)(?:/|$)|^(?:\\.\\.?/)+(?:App|main)(?:\\.[^/]+)?$|^@ultigrid/insight(?:/|$)',
          message: 'Core must not depend on Insight, Studio, or demo application modules.',
        }],
      }],
    },
  },
  {
    files: ['src/bi/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '^(?:\\.\\.?/)+(?:core|demo|i18n|studio|utils)(?:/|$)|^(?:\\.\\.?/)+(?:App|main)(?:\\.[^/]+)?$',
            message: 'Insight must use the public @ultigrid/core entry and stay independent of Studio/demo modules.',
          },
          {
            regex: '^@ultigrid/core/(?!style\\.css$)',
            message: 'Insight may only use the @ultigrid/core root and its public style.css entry.',
          },
        ],
      }],
    },
  },
  {
    files: [
      'src/App.tsx',
      'src/demo/**/*.{ts,tsx}',
      'src/i18n/**/*.{ts,tsx}',
      'src/studio/**/*.{ts,tsx}',
      'src/utils/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '^(?:\\.\\.?/)+(?:core|bi)(?:/|$)',
            message: 'Application layers must consume Core and Insight through their package entry points.',
          },
          {
            regex: '^@ultigrid/(?:core|insight)/(?!style\\.css$)',
            message: 'Only the package root and public style.css entry are supported.',
          },
        ],
      }],
    },
  },
  {
    files: ['src/main.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            regex: '^(?!.*\\.css$)(?:\\.\\.?/)+(?:core|bi)(?:/|$)',
            message: 'The app entry may assemble source CSS but must consume TypeScript APIs through package roots.',
          },
          {
            regex: '^@ultigrid/(?:core|insight)/(?!style\\.css$)',
            message: 'Only the package root and public style.css entry are supported.',
          },
        ],
      }],
    },
  },
)
