// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import lit from "eslint-plugin-lit";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/*.generated.js",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["src/**/*.ts", "demo/**/*.ts"],
    ...lit.configs["flat/recommended"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["*.config.{js,ts}", "scripts/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    // Tests may assert values exist and use minimal stub classes
    files: ["**/tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
  prettier,
);
