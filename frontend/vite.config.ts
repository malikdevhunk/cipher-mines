import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Content-Security-Policy as a meta tag (GitHub Pages cannot send headers). Injected for builds only, so the dev server keeps HMR.
// connect-src: Zama relayer + the public-key bucket the relayer SDK downloads from. Everything else is same-origin.
const CSP = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://relayer.testnet.zama.org https://*.s3.eu-west-1.amazonaws.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ");

const csp = (): Plugin => ({
  name: "inject-csp",
  apply: "build",
  transformIndexHtml: (html) =>
    html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

// base "./" keeps asset paths relative so the build works under the GitHub Pages sub-path.
export default defineConfig({
  base: "./",
  plugins: [react(), csp()],
  optimizeDeps: { exclude: ["@zama-fhe/relayer-sdk"] },
  build: {
    target: "es2022",
    sourcemap: false,
    assetsInlineLimit: 0, // fonts must stay real files so font-src 'self' holds
    minify: "terser",
    chunkSizeWarningLimit: 4000,
    terser: {
      compress: { drop_console: true, drop_debugger: true, passes: 2 },
      mangle: { toplevel: true },
      format: { comments: false },
    },
  },
});
