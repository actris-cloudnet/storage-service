module.exports = {
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  root: true,
  overrides: [
    {
      "files": ['**/*.test.ts'],
      "plugins": ['jest'],
      "extends": ["plugin:jest/recommended"],
    }
  ],
  ignorePatterns: ['build/']
};
