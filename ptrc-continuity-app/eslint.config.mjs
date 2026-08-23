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
    // One-off Node build script (icon generation), not part of the app bundle.
    "scripts/**",
  ]),
  {
    rules: {
      // This app's whole premise is client-side state backed by IndexedDB/localStorage
      // (see ARCHITECTURE.md §3) — reading that external, client-only storage and
      // syncing it into React state necessarily happens in an effect after mount
      // (window/localStorage don't exist during server prerender). That's the intended
      // "sync from an external store" use of useEffect, not the accidental-derived-state
      // anti-pattern this rule targets, so it's disabled project-wide rather than
      // suppressed line-by-line in every hook that reads local storage.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
