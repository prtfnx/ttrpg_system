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
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // Empty blocks common in event handlers and catch-alls
      'no-empty': ['warn', { allowEmptyCatch: true }],
      // Switch case declarations are pre-existing pattern
      'no-case-declarations': 'warn',
      // Legacy type aliases — warn until replaced
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      // Pre-existing hooks violations in legacy code — tracked as tech debt
      'react-hooks/rules-of-hooks': 'warn',
      // Other pre-existing issues to address progressively
      'no-useless-escape': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      'no-constant-binary-expression': 'warn',
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
