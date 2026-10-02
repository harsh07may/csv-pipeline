const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  { ignores: ["dist/", "node_modules/", "drizzle/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" }, rules: { "@typescript-eslint/no-require-imports": "off" } },
);
