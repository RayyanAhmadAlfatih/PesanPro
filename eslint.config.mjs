import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Untracked duplicate copy of the repository. It is not part of the app
    // and would otherwise be linted twice with stale code.
    "pure/**",
    // Build directories left behind by failed or partial builds. They are
    // generated output, not source, and linting them can exhaust the heap.
    ".next.*/**",
    ".qa-tmp/**",
  ]),
]);

export default eslintConfig;
