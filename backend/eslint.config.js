import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["data*/**", "coverage/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { process: "readonly", console: "readonly", setTimeout: "readonly", setImmediate: "readonly", clearTimeout: "readonly", clearInterval: "readonly", setInterval: "readonly", Buffer: "readonly", DOMPoint: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    // test + tooling code walks loosely-typed JSON; `any` is acceptable there
    files: ["tests/**/*.ts", "scripts/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  }
);
