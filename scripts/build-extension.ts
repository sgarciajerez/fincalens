import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEnv } from "vite";
import { fileURLToPath } from "node:url";

const env = loadEnv(process.env.NODE_ENV || "development", process.cwd());
const apiBase = (
  process.env.FINCALENS_API_BASE ||
  env.VITE_API_BASE ||
  "http://127.0.0.1:4174"
).replace(/\/$/, "");
const apiUrl = new URL(apiBase);
if (process.env.NODE_ENV === "production" && apiUrl.protocol !== "https:")
  throw new Error("FINCALENS_API_BASE debe usar HTTPS en producción.");

const out = "dist/extension";
await mkdir(out, { recursive: true });
await Promise.all([
  build({
    entryPoints: ["apps/extension/src/popup.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    outfile: `${out}/popup.js`,
    packages: "bundle",
    define: { __FINCALENS_API_BASE__: JSON.stringify(apiBase) },
  }),
  build({
    entryPoints: ["apps/extension/src/service-worker.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome120",
    outfile: `${out}/service-worker.js`,
    packages: "bundle",
  }),
]);
for (const file of ["popup.html", "popup.css", "icon.svg"])
  await cp(`apps/extension/${file}`, `${out}/${file}`);
const manifest = JSON.parse(
  await readFile("apps/extension/manifest.json", "utf8"),
) as Record<string, unknown>;
manifest.host_permissions = [
  "https://www.idealista.com/inmueble/*",
  `${apiUrl.origin}/*`,
];
await writeFile(
  `${out}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
