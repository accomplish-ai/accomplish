export default {
  // Lint and format TS/JS files
  '*.{ts,tsx,js,jsx}': ['eslint --fix --no-warn-ignored', 'prettier --write'],
  // Format everything else
  '*.{json,md,yml,yaml,css,html}': ['prettier --write'],
};
