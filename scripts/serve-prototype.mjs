import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "design");
const port = Number(process.env.PORT || 4173);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const allowed =
      /^(index|informe|comparar|analizar|extension|ajustes)\.html$/.test(
        relative,
      ) || /^assets\/[a-zA-Z0-9_./-]+\.(css|js|svg)$/.test(relative);
    const target = resolve(root, relative);
    if (!allowed || !target.startsWith(root + sep)) {
      response.writeHead(404).end("Not found");
      return;
    }
    const data = await readFile(target);
    response.writeHead(200, {
      "Content-Type": mime[extname(target)] || "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(data);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`FincaLens · http://127.0.0.1:${port}`),
);
