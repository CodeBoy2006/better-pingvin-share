import eslint from "@eslint/js";
import tseslintPlugin from "@typescript-eslint/eslint-plugin";
import tseslintParser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";

const tsEslintRecommendedOverrides =
  tseslintPlugin.configs["eslint-recommended"].overrides?.[0]?.rules ?? {};

export default defineConfig([
  {
    ignores: ["dist/**", "data/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslintParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: {
      "@typescript-eslint": tseslintPlugin,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tsEslintRecommendedOverrides,
      ...tseslintPlugin.configs.recommended.rules,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
]);
