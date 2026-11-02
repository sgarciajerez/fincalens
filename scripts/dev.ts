import { spawn } from "node:child_process";
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/api/src/server.ts"], {
    stdio: "inherit",
  }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  children.forEach((c) => c.kill());
  setTimeout(() => process.exit(code), 100).unref();
}
children.forEach((c) =>
  c.on("exit", (code) => {
    if (!closing) close(code || 0);
  }),
);
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
