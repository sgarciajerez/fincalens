import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/web",
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: { "/v1": "http://127.0.0.1:4174" },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
