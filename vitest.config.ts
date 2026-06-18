import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import { fileURLToPath } from "node:url";

const serverOnlyStub = fileURLToPath(
  new URL("./test/empty-module.ts", import.meta.url),
);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      "server-only": serverOnlyStub,
      "client-only": serverOnlyStub,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
