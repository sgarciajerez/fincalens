import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root: "apps/web",
  envDir: root,
  define: {
    "import.meta.env.VITE_API_BASE": JSON.stringify(
      loadEnv(process.env.NODE_ENV || "development", root).VITE_API_BASE || "",
    ),
  },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    proxy: { "/v1": "http://127.0.0.1:4174" },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
