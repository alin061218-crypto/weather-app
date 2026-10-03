const nodeGlobals = {
  AbortController: 'readonly',
  AbortSignal: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  FormData: 'readonly',
  JSON: 'readonly',
  localStorage: 'readonly',
  Math: 'readonly',
  NodeJS: 'readonly',
  process: 'readonly',
  require: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  URL: 'readonly',
  window: 'readonly'
};

module.exports = [
  {
    ignores: ['frontend/vendor/**', 'evidence/**', 'backups/**', 'node_modules/**']
  },
  {
    files: ['server.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: nodeGlobals
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-warning-comments': 'off'
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-warning-comments': 'off'
    }
  }
];
