import js from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // Build output, the local pnpm store and scratch folders (compiled fight sim,
  // asset unpacking, headless screenshots) are not source: `eslint .` used to
  // spend ~90s of its ~100s on them, so they are excluded by pattern.
  {
    ignores: [
      "dist/**",
      ".sim/**",
      ".pnpm-store/**",
      ".tmp-*/**",
      "assetspacks/**",
      "esb-test/**",
    ],
  },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      prettier,
    ],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
);
