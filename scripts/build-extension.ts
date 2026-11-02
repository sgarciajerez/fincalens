import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";

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
await writeFile(
  `${out}/manifest.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
