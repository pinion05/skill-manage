import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    // hot:false — tests never use HMR, and on Windows the solid-refresh
    // runtime id "/@solid-refresh" fails to resolve (file:/// URL without a
    // drive letter crashes fileURLToPath).
    solid({ hot: false }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
