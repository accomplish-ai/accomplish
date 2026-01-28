/**
 * @see https://prettier.io/docs/configuration
 * @type {import("prettier").Config & import('prettier-plugin-tailwindcss').PluginOptions}}
 */
module.exports = {
  arrowParens: 'always',
  tabWidth: 2,
  trailingComma: 'es5',
  semi: true,
  singleQuote: true,
  plugins: ['prettier-plugin-tailwindcss'],
};
