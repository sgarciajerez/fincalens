import { openDatabase } from "./database.js";
import { createApi } from "./app.js";
const db = await openDatabase({
  url: process.env.DATABASE_URL,
  file: process.env.SQLITE_PATH,
});
const authMode = process.env.AUTH_MODE === "accounts" ? "accounts" : "local";
const secureCookies = process.env.COOKIE_SECURE === "true";
if (
  authMode === "accounts" &&
  process.env.NODE_ENV === "production" &&
  !secureCookies
) {
  throw new Error(
    "COOKIE_SECURE=true es obligatorio para cuentas en producción.",
  );
}
const { app } = await createApi(db, {
  authMode,
  secureCookies,
  webOrigin: process.env.WEB_ORIGIN,
});
await app.listen({
  port: Number(process.env.API_PORT || 4174),
  host: "127.0.0.1",
});
console.log(`FincaLens API · http://127.0.0.1:4174 · modo ${authMode}`);
const close = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
