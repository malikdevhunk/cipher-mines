import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base: "./"` keeps asset paths relative so the build works on GitHub Pages sub-paths.
export default defineConfig({
  base: "./",
  plugins: [react()],
  optimizeDeps: { exclude: ["@zama-fhe/relayer-sdk"] },
  build: { target: "es2022", chunkSizeWarningLimit: 4000 },
});
