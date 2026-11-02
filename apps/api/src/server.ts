import { openDatabase } from "./database.js";
import { createApi } from "./app.js";
const db = await openDatabase({
  url: process.env.DATABASE_URL,
  file: process.env.SQLITE_PATH,
});
const authMode = process.env.AUTH_MODE === "accounts" ? "accounts" : "local";
const secureCookies = process.env.COOKIE_SECURE === "true";
if (process.env.NODE_ENV === "production") {
  if (authMode !== "accounts")
    throw new Error("AUTH_MODE=accounts es obligatorio en producción.");
  if (!secureCookies)
    throw new Error("COOKIE_SECURE=true es obligatorio en producción.");
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL de PostgreSQL es obligatorio en producción.");
  if (!process.env.WEB_ORIGIN?.startsWith("https://"))
    throw new Error("WEB_ORIGIN HTTPS es obligatorio en producción.");
}
const { app } = await createApi(db, {
  authMode,
  secureCookies,
  webOrigin: process.env.WEB_ORIGIN,
});
await app.listen({
  port: Number(process.env.API_PORT || 4174),
  host: process.env.API_HOST || "127.0.0.1",
});
console.log(`FincaLens API · http://127.0.0.1:4174 · modo ${authMode}`);
const close = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
