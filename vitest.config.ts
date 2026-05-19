import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "dist", "test-fixtures"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/app/(app)/_lib/**/*.ts", "src/app/(app)/ekstre/actions.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
