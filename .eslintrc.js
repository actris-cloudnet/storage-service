const commonRules = require('./.eslintrc-common.js').rules

module.exports = {
  'root': true,
  'env': {
    'browser': true,
    'es6': true,
    'node': true
  },
  'extends': [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended'
  ],
  'globals': {
    'Atomics': 'readonly',
    'SharedArrayBuffer': 'readonly'
  },
  'parser': '@typescript-eslint/parser',
  'parserOptions': {
    'ecmaVersion': 2018,
    'sourceType': 'module'
  },
  'plugins': [
    '@typescript-eslint'
  ],
  'overrides': [
    {
      'files': [
        '**/*.test.js'
      ],
      'env': {
        'jest': true
      }
    }
  ],
  'ignorePatterns': ['dist/', 'node_modules/', 'build/', 'public/', 'src/migration/', 'python/', 'jest.config.js'],
  rules: { ...commonRules }
}
