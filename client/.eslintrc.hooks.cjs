// Minimal, isolated ESLint config that enforces ONLY the Rules of Hooks as an
// error. The main `npm run lint` also surfaces style/`no-explicit-any` issues
// and is noisy; this one is a focused, fast gate wired into `npm run build` so
// a conditional/early-returned React hook (which crashes the whole app at
// runtime with "Rendered more hooks than during the previous render", React
// error #310) can never reach production again.
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['react-hooks'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
  },
  env: { browser: true, es2022: true },
  ignorePatterns: ['dist', 'node_modules'],
};
