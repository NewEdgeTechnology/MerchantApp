// eslint.config.cjs
/** @type {import('eslint').Linter.FlatConfig[]} */
const js = require('@eslint/js');
const react = require('eslint-plugin-react');
const reactNative = require('eslint-plugin-react-native');

module.exports = [
  js.configs.recommended,

  // Ignore generated / native folders
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      'build/**',
      '.expo/**',
      '.vscode/**',
    ],
  },

  // App code (RN + React)
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      // RN globals so you don't get "no-undef" for timers/fetch/console/require, etc.
      globals: {
        __DEV__: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        require: 'readonly',
      },
    },
    plugins: {
      react,
      'react-native': reactNative,
    },
    rules: {
      // 🔴 This is the one we care about to find your error
      'react-native/no-raw-text': 'error',

      // Reduce noise while you’re hunting errors
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
    settings: { react: { version: 'detect' } },
  },

  // Node config files (so "module"/"require" are allowed there)
  {
    files: ['**/*.config.{js,cjs,mjs}', 'babel.config.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        process: 'readonly',
      },
    },
  },
];
