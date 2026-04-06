import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Pervasive at system/protocol boundaries — fix progressively
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow unused vars with _ prefix (intentional placeholders)
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Upgraded to error — all instances fixed
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-case-declarations': 'error',
      '@typescript-eslint/no-unsafe-function-type': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'no-useless-escape': 'error',
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unused-expressions': 'error',
      'no-constant-binary-expression': 'error',
    },
  },
  // Test files: relax rules that conflict with mocking patterns
  {
    files: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*', '**/test/**', '**/test-utils/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
])
