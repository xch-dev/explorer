import eslint from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(globalIgnores(['dist']), {
  files: ['src/**/*.{ts,tsx}'],
  extends: [
    eslint.configs.recommended,
    tseslint.configs.recommended,
    tseslint.configs.strict,
    tseslint.configs.stylistic,
    reactHooks.configs['recommended-latest'],
    reactRefresh.configs.vite,
  ],
  languageOptions: {
    ecmaVersion: 2020,
    globals: globals.browser,
  },
  plugins: {
    react,
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/no-unstable-nested-components': 'warn',
    'react/hook-use-state': 'warn',
    'react/button-has-type': 'warn',
    'react/default-props-match-prop-types': 'warn',
    'react/no-did-mount-set-state': 'warn',
    'react/no-did-update-set-state': 'warn',
    'react/no-invalid-html-attribute': 'warn',
    'react/no-unsafe': 'warn',
    'react/no-typos': 'warn',
    'react/no-array-index-key': 'warn',
    'react/no-danger': 'warn',
    'react/require-optimization': 'warn',
    'react/no-access-state-in-setstate': 'warn',
    'react/no-redundant-should-component-update': 'warn',
    'react/no-this-in-sfc': 'warn',
    'react/no-unused-state': 'warn',
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
});
