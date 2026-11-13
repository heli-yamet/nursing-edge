import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/mongo-ensure-indexes.harness.test.ts",
    ],
    setupFiles: ["src/tests/env-local.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
