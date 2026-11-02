import { openDatabase } from "./database.js";
import { createApi } from "./app.js";
const db = await openDatabase({
  url: process.env.DATABASE_URL,
  file: process.env.SQLITE_PATH,
});
const { app } = await createApi(db);
await app.listen({
  port: Number(process.env.API_PORT || 4174),
  host: "127.0.0.1",
});
console.log("FincaLens API · http://127.0.0.1:4174 · modo local");
const close = async () => {
  await app.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
