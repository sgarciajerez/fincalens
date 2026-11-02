import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scrypt as nodeScrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { z } from "zod";
import {
  analysisInputSchema,
  scenarioSchema,
  snapshotSchema,
  type AnalysisJob,
  type AnalysisInput,
  type ReportRevision,
  type PropertySummary,
  marketReferenceInputSchema,
  comparableListingInputSchema,
  type ComparableListingSnapshot,
  type MarketComparable,
  type MarketReferenceSnapshot,
  saleAreaReferenceInputSchema,
  type SaleAreaReferenceSnapshot,
} from "@fincalens/contracts";
import {
  CALC_VERSION,
  calculate,
  createReport,
  deriveMarketAnalysis,
  detectRisks,
} from "@fincalens/domain";
import { examples } from "../../../packages/fixtures/src/index.js";
import { type Database, type Row } from "./database.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const token = () => randomBytes(32).toString("base64url");
const scrypt = (
  password: string,
  salt: Buffer,
  length: number,
  options: ScryptOptions,
) =>
  new Promise<Buffer>((resolve, reject) => {
    nodeScrypt(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
const passwordSchema = z.string().min(12).max(128);
const emailSchema = z.string().trim().email().max(254);
async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$32768$${salt.toString("hex")}$${derived.toString("hex")}`;
}
async function verifyPassword(password: string, encoded: string) {
  const [scheme, cost, saltHex, hashHex] = encoded.split("$");
  if (
    scheme !== "scrypt" ||
    cost !== "32768" ||
    !/^[a-f0-9]{32}$/.test(saltHex || "") ||
    !/^[a-f0-9]{128}$/.test(hashHex || "")
  )
    return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
    { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
  );
  return timingSafeEqual(actual, expected);
}
class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
const parseReport = (row: Row) =>
  JSON.parse(String(row.data)) as ReportRevision;
const geographyKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const geographyMatches = (reference: string, location: string) =>
  location.split(/[·,]/).map(geographyKey).includes(geographyKey(reference));
const marketReferenceView = (row: Row): MarketReferenceSnapshot => ({
  id: String(row.id),
  geography: String(row.geography),
  level: row.geography_level as MarketReferenceSnapshot["level"],
  rentPerM2: Number(row.rent_per_m2),
  asOf: String(row.as_of),
  sampleSize: row.sample_size === null ? null : Number(row.sample_size),
  dispersion: row.dispersion === null ? null : Number(row.dispersion),
  sourceLabel: String(row.source_label),
  usageTerms: String(row.usage_terms),
  importedAt: String(row.imported_at),
});
const saleAreaReferenceView = (row: Row): SaleAreaReferenceSnapshot => ({
  id: String(row.id),
  geography: String(row.geography),
  level: row.geography_level as SaleAreaReferenceSnapshot["level"],
  salePricePerM2: Number(row.sale_price_per_m2),
  asOf: String(row.as_of),
  sampleSize: row.sample_size === null ? null : Number(row.sample_size),
  sourceLabel: String(row.source_label),
  usageTerms: String(row.usage_terms),
  importedAt: String(row.imported_at),
});
const comparableView = (row: Row): ComparableListingSnapshot => ({
  id: String(row.id),
  ...(row.listing_key ? { listingKey: String(row.listing_key) } : {}),
  geography: String(row.geography),
  propertyType: String(
    row.property_type,
  ) as ComparableListingSnapshot["propertyType"],
  price: Number(row.price),
  area: Number(row.area),
  bedrooms: row.bedrooms === null ? null : Number(row.bedrooms),
  observedAt: String(row.observed_at),
  sourceLabel: String(row.source_label),
  usageTerms: String(row.usage_terms),
  importedAt: String(row.imported_at),
});

export async function createApi(
  db: Database,
  options: {
    webOrigin?: string;
    runWorker?: boolean;
    authMode?: "local" | "accounts";
    secureCookies?: boolean;
  } = {},
) {
  const webOrigin = options.webOrigin || "http://127.0.0.1:4173";
  const authMode = options.authMode || "local";
  const secureCookies = options.secureCookies ?? false;
  const dummyPasswordHash = await hashPassword(token());
  const app = Fastify({
    logger: process.env.NODE_ENV === "production",
    bodyLimit: 100_000,
    trustProxy: process.env.TRUST_PROXY === "true",
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, callback) =>
      callback(
        null,
        !origin ||
          origin === webOrigin ||
          /^chrome-extension:\/\/[a-p]{32}$/.test(origin),
      ),
    credentials: true,
  });
  app.get("/healthz", async (_req, reply) => {
    try {
      await db.all("SELECT 1 AS ok");
      return { status: "ok" };
    } catch {
      reply.code(503);
      return { status: "unavailable" };
    }
  });
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      reply.code(400).send({
        error: "Datos inválidos",
        issues: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    if (error instanceof RangeError) {
      reply.code(422).send({ error: error.message });
      return;
    }
    const statusCode =
      error instanceof Error &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const status = statusCode < 500 ? statusCode : 500;
    if (status === 500) request.log.error({ err: error }, "API error");
    reply.code(status).send({
      error:
        status === 500
          ? "No se pudo completar la operación."
          : error instanceof Error
            ? error.message
            : "Solicitud inválida.",
    });
  });
  const attempts = new Map<string, { count: number; until: number }>();
  const authAttempts = new Map<string, { count: number; until: number }>();
  app.addHook("onRequest", async (req) => {
    if (req.method === "OPTIONS") return;
    const key = req.ip,
      entry = attempts.get(key),
      time = Date.now();
    if (!entry || entry.until < time)
      attempts.set(key, { count: 1, until: time + 60_000 });
    else if (++entry.count > 180)
      throw new HttpError(429, "Demasiadas solicitudes. Espera un minuto.");
    if (attempts.size > 2000)
      for (const [k, v] of attempts) if (v.until < time) attempts.delete(k);
    // Pairing is intentionally unauthenticated, but only the local web app and
    // a real Chrome extension origin may submit the one-time code.
    const pairingRequest =
      req.method === "POST" &&
      req.url === "/v1/installations" &&
      /^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin || "");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.headers.authorization &&
      req.headers.origin !== webOrigin &&
      !pairingRequest
    )
      throw new HttpError(403, "Origen no permitido.");
  });
  function limitAuthAttempts(req: FastifyRequest) {
    const time = Date.now();
    const current = authAttempts.get(req.ip);
    if (!current || current.until < time) {
      authAttempts.set(req.ip, { count: 1, until: time + 60_000 });
    } else if (++current.count > 8) {
      throw new HttpError(429, "Demasiados intentos. Espera un minuto.");
    }
  }
  async function createSession(ownerId: string, reply: FastifyReply) {
    const raw = token();
    await db.run(
      "INSERT INTO sessions(hash,owner_id,expires_at) VALUES($1,$2,$3)",
      [hash(raw), ownerId, new Date(Date.now() + 7 * 86400_000).toISOString()],
    );
    reply.setCookie("fl_session", raw, {
      httpOnly: true,
      sameSite: "strict",
      secure: secureCookies,
      path: "/",
      maxAge: 7 * 86400,
    });
  }
  async function owner(req: FastifyRequest): Promise<string> {
    const bearer = req.headers.authorization;
    if (bearer) {
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(bearer);
      if (!match) throw new HttpError(401, "Conexión no válida.");
      const rows = await db.all(
        "SELECT owner_id FROM installations WHERE hash=$1",
        [hash(match[1])],
      );
      if (!rows[0]) throw new HttpError(401, "Vuelve a conectar la extensión.");
      return String(rows[0].owner_id);
    }
    const raw = req.cookies.fl_session;
    if (!raw)
      throw new HttpError(
        401,
        "Abre de nuevo la aplicación para iniciar sesión local.",
      );
    const rows = await db.all(
      "SELECT owner_id,expires_at FROM sessions WHERE hash=$1",
      [hash(raw)],
    );
    if (!rows[0] || String(rows[0].expires_at) < now())
      throw new HttpError(401, "La sesión local ha caducado.");
    return String(rows[0].owner_id);
  }
  const reportFor = async (id: string, who: string) => {
    const rows = await db.all(
      "SELECT data FROM reports WHERE id=$1 AND owner_id=$2",
      [id, who],
    );
    if (!rows[0]) throw new HttpError(404, "Informe no encontrado.");
    return parseReport(rows[0]);
  };
  app.get("/v1/health", async () => ({
    status: "ok",
    mode: "local-development",
    engine: CALC_VERSION,
  }));
  app.get("/v1/session", async (req, reply) => {
    let valid = false;
    let displayName = "Mi espacio local";
    if (req.cookies.fl_session) {
      const rows = await db.all(
        "SELECT owner_id,expires_at FROM sessions WHERE hash=$1",
        [hash(req.cookies.fl_session)],
      );
      valid = !!rows[0] && String(rows[0].expires_at) > now();
      if (valid && authMode === "accounts") {
        const users = await db.all("SELECT email FROM users WHERE id=$1", [
          rows[0].owner_id,
        ]);
        valid = !!users[0];
        if (valid) displayName = String(users[0].email);
      }
    }
    if (authMode === "accounts") {
      return { mode: authMode, authenticated: valid, displayName };
    }
    if (!valid) await createSession("local-user", reply);
    return {
      mode: "local",
      authenticated: true,
      displayName: "Mi espacio local",
      marketProvider: false,
    };
  });
  app.post("/v1/auth/register", async (req, reply) => {
    if (authMode !== "accounts")
      throw new HttpError(404, "El modo de cuentas no está habilitado.");
    limitAuthAttempts(req);
    const body = z
      .object({ email: emailSchema, password: passwordSchema })
      .parse(req.body);
    const email = body.email.toLowerCase();
    const id = randomUUID();
    const passwordHash = await hashPassword(body.password);
    try {
      await db.transaction(async (tx) => {
        await tx.run(
          "INSERT INTO users(id,email,password_hash,created_at) VALUES($1,$2,$3,$4)",
          [id, email, passwordHash, now()],
        );
        const raw = token();
        await tx.run(
          "INSERT INTO sessions(hash,owner_id,expires_at) VALUES($1,$2,$3)",
          [hash(raw), id, new Date(Date.now() + 7 * 86400_000).toISOString()],
        );
        reply.setCookie("fl_session", raw, {
          httpOnly: true,
          sameSite: "strict",
          secure: secureCookies,
          path: "/",
          maxAge: 7 * 86400,
        });
      });
    } catch (error) {
      const duplicate = await db.all("SELECT id FROM users WHERE email=$1", [
        email,
      ]);
      if (duplicate.length)
        throw new HttpError(409, "No se pudo crear la cuenta con esos datos.");
      throw error;
    }
    reply.code(201);
    return { mode: authMode, authenticated: true, displayName: email };
  });
  app.post("/v1/auth/login", async (req, reply) => {
    if (authMode !== "accounts")
      throw new HttpError(404, "El modo de cuentas no está habilitado.");
    limitAuthAttempts(req);
    const body = z
      .object({ email: emailSchema, password: passwordSchema })
      .parse(req.body);
    const rows = await db.all(
      "SELECT id,email,password_hash FROM users WHERE email=$1",
      [body.email.toLowerCase()],
    );
    const passwordValid = await verifyPassword(
      body.password,
      String(rows[0]?.password_hash || dummyPasswordHash),
    );
    if (!rows[0] || !passwordValid)
      throw new HttpError(401, "Correo o contraseña incorrectos.");
    await createSession(String(rows[0].id), reply);
    return {
      mode: authMode,
      authenticated: true,
      displayName: String(rows[0].email),
    };
  });
  app.post("/v1/auth/logout", async (req, reply) => {
    if (req.cookies.fl_session)
      await db.run("DELETE FROM sessions WHERE hash=$1", [
        hash(req.cookies.fl_session),
      ]);
    reply.clearCookie("fl_session", {
      path: "/",
      sameSite: "strict",
      secure: secureCookies,
    });
    return { ok: true };
  });
  app.post("/v1/pairing", async (req) => {
    const who = await owner(req),
      code = String(randomInt(10000000, 100000000));
    await db.run("DELETE FROM pairing_codes WHERE owner_id=$1", [who]);
    await db.run(
      "INSERT INTO pairing_codes(hash,owner_id,expires_at) VALUES($1,$2,$3)",
      [hash(code), who, new Date(Date.now() + 5 * 60_000).toISOString()],
    );
    return { code, expiresIn: 300 };
  });
  let pairingAttempts = { count: 0, reset: Date.now() };
  app.post("/v1/installations", async (req) => {
    if (Date.now() - pairingAttempts.reset > 60000)
      pairingAttempts = { count: 0, reset: Date.now() };
    if (++pairingAttempts.count > 10)
      throw new HttpError(429, "Demasiados intentos de conexión.");
    const { code } = z
      .object({ code: z.string().regex(/^\d{8}$/) })
      .parse(req.body);
    return db.transaction(async (tx) => {
      const rows = await tx.all(
        "SELECT owner_id,expires_at FROM pairing_codes WHERE hash=$1",
        [hash(code)],
      );
      if (!rows[0] || String(rows[0].expires_at) < now())
        throw new HttpError(401, "Código incorrecto o caducado.");
      await tx.run("DELETE FROM pairing_codes WHERE hash=$1", [hash(code)]);
      const raw = token();
      await tx.run(
        "INSERT INTO installations(hash,owner_id,created_at) VALUES($1,$2,$3)",
        [hash(raw), rows[0].owner_id, now()],
      );
      return { token: raw };
    });
  });
  app.delete("/v1/installations/current", async (req) => {
    const bearer = req.headers.authorization;
    const match = bearer && /^Bearer ([A-Za-z0-9_-]{43})$/.exec(bearer);
    if (!match) throw new HttpError(401, "Conexión no válida.");
    await db.run("DELETE FROM installations WHERE hash=$1", [hash(match[1])]);
    return { ok: true };
  });
  async function enqueue(
    who: string,
    input: AnalysisInput,
  ): Promise<AnalysisJob> {
    const stable = {
      ...input,
      snapshot: {
        ...input.snapshot,
        capturedAt: "",
        extractorVersion: input.snapshot.extractorVersion,
      },
    };
    const digest = hash(
      JSON.stringify({ version: CALC_VERSION, input: stable }),
    );
    return db.transaction(async (tx) => {
      const existing = await tx.all(
        "SELECT * FROM jobs WHERE owner_id=$1 AND input_hash=$2",
        [who, digest],
      );
      if (existing[0]) return jobView(existing[0]);
      const id = randomUUID(),
        createdAt = now();
      await tx.run(
        "INSERT INTO jobs(id,owner_id,input_hash,payload,status,created_at) VALUES($1,$2,$3,$4,$5,$6)",
        [id, who, digest, JSON.stringify(input), "queued", createdAt],
      );
      return { id, status: "queued", reportId: null, error: null, createdAt };
    });
  }
  const jobView = (row: Row): AnalysisJob => ({
    id: String(row.id),
    status: row.status as AnalysisJob["status"],
    reportId: row.report_id ? String(row.report_id) : null,
    error: row.error ? String(row.error) : null,
    createdAt: String(row.created_at),
  });
  app.post("/v1/analysis-jobs", async (req, reply) => {
    const who = await owner(req),
      input = analysisInputSchema.parse(req.body);
    if (
      input.snapshot.portal === "idealista" &&
      (!input.snapshot.url ||
        !/^https:\/\/www\.idealista\.com\/inmueble\/\d+\/$/.test(
          input.snapshot.url,
        ))
    )
      throw new HttpError(400, "URL de anuncio no admitida.");
    const job = await enqueue(who, input);
    reply.code(202);
    return job;
  });
  app.get<{ Params: { id: string } }>("/v1/analysis-jobs/:id", async (req) => {
    const who = await owner(req),
      rows = await db.all("SELECT * FROM jobs WHERE id=$1 AND owner_id=$2", [
        req.params.id,
        who,
      ]);
    if (!rows[0]) throw new HttpError(404, "Análisis no encontrado.");
    return jobView(rows[0]);
  });
  let working = false;
  async function workOnce() {
    if (working) return;
    working = true;
    try {
      const rows = await db.all(
        "SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1",
      );
      if (!rows[0]) return;
      const job = rows[0];
      await db.run("UPDATE jobs SET status=$1 WHERE id=$2", [
        "running",
        job.id,
      ]);
      try {
        const input = analysisInputSchema.parse(
            JSON.parse(String(job.payload)),
          ),
          snapshot = input.snapshot,
          who = String(job.owner_id);
        await db.transaction(async (tx) => {
          const canonical =
            snapshot.url ||
            `${snapshot.portal}:${snapshot.listingId || job.id}`;
          const found = await tx.all(
            "SELECT * FROM properties WHERE owner_id=$1 AND canonical_key=$2",
            [who, canonical],
          );
          const propertyId = found[0] ? String(found[0].id) : randomUUID(),
            createdAt = now();
          const report = createReport(snapshot, input.scenario, {
            id: randomUUID(),
            propertyId,
            createdAt,
          });
          if (!found[0])
            await tx.run(
              "INSERT INTO properties(id,owner_id,canonical_key,updated_at) VALUES($1,$2,$3,$4)",
              [propertyId, who, canonical, createdAt],
            );
          await tx.run(
            "INSERT INTO reports(id,owner_id,property_id,data,created_at) VALUES($1,$2,$3,$4,$5)",
            [report.id, who, propertyId, JSON.stringify(report), createdAt],
          );
          await tx.run(
            "UPDATE properties SET report_id=$1,updated_at=$2 WHERE id=$3",
            [report.id, createdAt, propertyId],
          );
          const last = await tx.all(
            "SELECT price FROM observations WHERE property_id=$1 AND owner_id=$2 ORDER BY observed_at DESC LIMIT 1",
            [propertyId, who],
          );
          if (!last[0] || Number(last[0].price) !== snapshot.price)
            await tx.run(
              "INSERT INTO observations(id,owner_id,property_id,price,observed_at) VALUES($1,$2,$3,$4,$5)",
              [
                randomUUID(),
                who,
                propertyId,
                snapshot.price,
                snapshot.capturedAt,
              ],
            );
          await tx.run("UPDATE jobs SET status=$1,report_id=$2 WHERE id=$3", [
            report.result.cashFlow === null ? "completed_partial" : "completed",
            report.id,
            job.id,
          ]);
        });
      } catch (error) {
        await db.run("UPDATE jobs SET status=$1,error=$2 WHERE id=$3", [
          "failed",
          error instanceof RangeError
            ? error.message
            : "No se pudo procesar este análisis. Revisa los datos.",
          job.id,
        ]);
      }
    } finally {
      working = false;
    }
  }
  // Jobs survive restarts; a single local worker owns the queue in this first increment.
  await db.run("UPDATE jobs SET status='queued' WHERE status='running'");
  const interval =
    options.runWorker === false
      ? null
      : setInterval(() => {
          void workOnce();
        }, 200);
  interval?.unref();
  app.addHook("onClose", async () => {
    if (interval) clearInterval(interval);
    while (working) await new Promise((r) => setTimeout(r, 10));
  });
  app.get("/v1/properties", async (req) => {
    const who = await owner(req),
      rows = await db.all(
        "SELECT p.*,r.data FROM properties p JOIN reports r ON r.id=p.report_id WHERE p.owner_id=$1 ORDER BY p.updated_at DESC",
        [who],
      );
    return Promise.all(
      rows.map(async (row) => {
        const report = parseReport(row);
        const observations = await db.all(
          "SELECT price,observed_at FROM observations WHERE property_id=$1 AND owner_id=$2 ORDER BY observed_at",
          [row.id, who],
        );
        return {
          id: String(row.id),
          reportId: String(row.report_id),
          title: report.snapshot.title,
          location: report.snapshot.location,
          url: report.snapshot.url,
          price: report.snapshot.price,
          area: report.snapshot.area,
          rent: report.snapshot.rent,
          source: report.snapshot.source,
          favorite: !!row.favorite,
          notes: String(row.notes),
          score: report.result.score,
          netYield: report.result.netYield,
          cashFlow: report.result.cashFlow,
          updatedAt: String(row.updated_at),
          observations: observations.map((o) => ({
            price: Number(o.price),
            observedAt: String(o.observed_at),
          })),
        } satisfies PropertySummary;
      }),
    );
  });
  app.post("/v1/observations", async (req) => {
    const who = await owner(req);
    const body = z
      .object({
        url: z.string().url().max(2048),
        price: z.number().finite().min(1000).max(100_000_000),
        observedAt: z.string().datetime(),
      })
      .parse(req.body);
    const url = new URL(body.url);
    if (
      url.protocol !== "https:" ||
      !/^(www\.)?idealista\.com$/.test(url.hostname) ||
      !/^\/inmueble\/\d+\/?$/.test(url.pathname)
    )
      throw new HttpError(
        422,
        "Solo se admiten observaciones de anuncios públicos de Idealista.",
      );
    const canonical = `https://www.idealista.com${url.pathname.replace(/\/?$/, "/")}`;
    const rows = await db.all(
      "SELECT p.id FROM properties p WHERE p.owner_id=$1 AND p.canonical_key=$2",
      [who, canonical],
    );
    if (!rows[0]) return { tracked: false, recorded: false };
    const propertyId = String(rows[0].id);
    const latest = await db.all(
      "SELECT price,observed_at FROM observations WHERE property_id=$1 AND owner_id=$2 ORDER BY observed_at DESC LIMIT 1",
      [propertyId, who],
    );
    const previous = latest[0];
    const samePrice = previous && Number(previous.price) === body.price;
    const withinSixHours =
      previous &&
      Date.parse(body.observedAt) - Date.parse(String(previous.observed_at)) <
        6 * 60 * 60 * 1000;
    const recorded = !samePrice || !withinSixHours;
    if (recorded)
      await db.run(
        "INSERT INTO observations(id,owner_id,property_id,price,observed_at) VALUES($1,$2,$3,$4,$5)",
        [randomUUID(), who, propertyId, body.price, body.observedAt],
      );
    const history = await db.all(
      "SELECT price,observed_at FROM observations WHERE property_id=$1 AND owner_id=$2 ORDER BY observed_at DESC LIMIT 2",
      [propertyId, who],
    );
    return {
      tracked: true,
      recorded,
      latest: history[0]
        ? {
            price: Number(history[0].price),
            observedAt: String(history[0].observed_at),
          }
        : { price: body.price, observedAt: body.observedAt },
      previous: history[1]
        ? {
            price: Number(history[1].price),
            observedAt: String(history[1].observed_at),
          }
        : null,
    };
  });
  app.patch<{ Params: { id: string } }>("/v1/properties/:id", async (req) => {
    const who = await owner(req),
      body = z
        .object({
          favorite: z.boolean().optional(),
          notes: z.string().max(5000).optional(),
        })
        .parse(req.body);
    const rows = await db.all(
      "SELECT id FROM properties WHERE id=$1 AND owner_id=$2",
      [req.params.id, who],
    );
    if (!rows[0]) throw new HttpError(404, "Inmueble no encontrado.");
    if (body.favorite !== undefined)
      await db.run("UPDATE properties SET favorite=$1 WHERE id=$2", [
        body.favorite ? 1 : 0,
        req.params.id,
      ]);
    if (body.notes !== undefined)
      await db.run("UPDATE properties SET notes=$1 WHERE id=$2", [
        body.notes,
        req.params.id,
      ]);
    return { ok: true };
  });
  app.get<{ Params: { id: string } }>("/v1/reports/:id", async (req) =>
    reportFor(req.params.id, await owner(req)),
  );
  app.post<{ Params: { id: string } }>(
    "/v1/reports/:id/market-analysis",
    async (req, reply) => {
      const who = await owner(req),
        base = await reportFor(req.params.id, who);
      const requestedScenario = scenarioSchema.parse(req.body);
      const analysisBase = {
        ...base,
        scenario: requestedScenario,
        result: calculate(requestedScenario, base.snapshot, base.risks),
      };
      if (!base.snapshot.area)
        throw new HttpError(
          422,
          "Añade la superficie del inmueble antes de comparar precios.",
        );
      const importedRows = await db.all(
        "SELECT * FROM property_comparables WHERE owner_id=$1",
        [who],
      );
      const comparables: MarketComparable[] = importedRows.map((row) => {
        const item = comparableView(row);
        return {
          id: item.id,
          ...(item.listingKey ? { listingKey: item.listingKey } : {}),
          geography: item.geography,
          propertyType: item.propertyType,
          price: item.price,
          area: item.area,
          bedrooms: item.bedrooms,
          pricePerM2: item.price / item.area,
          observedAt: item.observedAt,
          sourceLabel: item.sourceLabel,
          usageTerms: item.usageTerms,
        };
      });
      const portfolioRows = await db.all(
        "SELECT p.id,r.data FROM properties p JOIN reports r ON r.id=p.report_id WHERE p.owner_id=$1 AND p.id<>$2",
        [who, base.propertyId],
      );
      for (const row of portfolioRows) {
        const report = parseReport(row);
        if (report.snapshot.source === "example") continue;
        comparables.push({
          id: String(row.id),
          geography: report.snapshot.location,
          propertyType: report.snapshot.propertyType ?? "unknown",
          price: report.snapshot.price,
          area: report.snapshot.area ?? 0,
          bedrooms: report.snapshot.bedrooms,
          pricePerM2: report.snapshot.area
            ? report.snapshot.price / report.snapshot.area
            : 0,
          observedAt: report.snapshot.capturedAt.slice(0, 10),
          sourceLabel: `Cartera propia · ${report.snapshot.portal}`,
          usageTerms:
            "Anuncio guardado por el usuario; precio solicitado, no precio de cierre.",
        });
      }
      const analysis = deriveMarketAnalysis(analysisBase, comparables);
      if (!analysis)
        throw new HttpError(
          422,
          "Añade la superficie del inmueble antes de comparar precios.",
        );
      const marketReference =
        base.marketReference &&
        base.snapshot.area &&
        requestedScenario.rent ===
          Math.round(base.snapshot.area * base.marketReference.rentPerM2)
          ? base.marketReference
          : undefined;
      const revision = createReport(base.snapshot, requestedScenario, {
        id: randomUUID(),
        propertyId: base.propertyId,
        parentId: base.id,
        createdAt: now(),
        ...(marketReference ? { marketReference } : {}),
      });
      revision.marketAnalysis = analysis;
      await db.transaction(async (tx) => {
        await tx.run(
          "INSERT INTO reports(id,owner_id,property_id,data,created_at) VALUES($1,$2,$3,$4,$5)",
          [
            revision.id,
            who,
            revision.propertyId,
            JSON.stringify(revision),
            revision.createdAt,
          ],
        );
        await tx.run(
          "UPDATE properties SET report_id=$1,updated_at=$2 WHERE id=$3 AND owner_id=$4",
          [revision.id, revision.createdAt, revision.propertyId, who],
        );
      });
      reply.code(201);
      return revision;
    },
  );
  app.post<{ Params: { id: string } }>(
    "/v1/reports/:id/scenarios",
    async (req, reply) => {
      const who = await owner(req);
      const base = await reportFor(req.params.id, who);
      const parsed = z
        .union([
          scenarioSchema,
          z.object({
            scenario: scenarioSchema,
            marketReferenceId: z.string().uuid().nullable().optional(),
          }),
        ])
        .parse(req.body);
      const scenario = "scenario" in parsed ? parsed.scenario : parsed;
      let marketReference: MarketReferenceSnapshot | undefined;
      if ("scenario" in parsed && parsed.marketReferenceId) {
        const rows = await db.all(
          "SELECT * FROM market_references WHERE id=$1 AND owner_id=$2",
          [parsed.marketReferenceId, who],
        );
        if (!rows[0])
          throw new HttpError(404, "Referencia de mercado no encontrada.");
        const candidate = marketReferenceView(rows[0]);
        if (
          !base.snapshot.area ||
          !geographyMatches(candidate.geography, base.snapshot.location)
        )
          throw new HttpError(
            422,
            "La referencia no corresponde exactamente a la zona y superficie del anuncio.",
          );
        if (detectRisks(base.snapshot).some((risk) => risk.needsContractRent))
          throw new HttpError(
            422,
            "No apliques una renta zonal a un inmueble con condiciones contractuales pendientes.",
          );
        const expectedRent = Math.round(
          base.snapshot.area * candidate.rentPerM2,
        );
        if (
          scenario.rent === null ||
          Math.abs(scenario.rent - expectedRent) > 1
        )
          throw new HttpError(
            422,
            "El alquiler del escenario debe coincidir con la referencia elegida por superficie.",
          );
        marketReference = candidate;
      }
      if (
        !marketReference &&
        base.marketReference &&
        base.snapshot.area &&
        scenario.rent ===
          Math.round(base.snapshot.area * base.marketReference.rentPerM2)
      )
        marketReference = base.marketReference;
      const revision = createReport(base.snapshot, scenario, {
        id: randomUUID(),
        propertyId: base.propertyId,
        parentId: base.id,
        createdAt: now(),
        ...(marketReference ? { marketReference } : {}),
      });
      await db.transaction(async (tx) => {
        await tx.run(
          "INSERT INTO reports(id,owner_id,property_id,data,created_at) VALUES($1,$2,$3,$4,$5)",
          [
            revision.id,
            who,
            revision.propertyId,
            JSON.stringify(revision),
            revision.createdAt,
          ],
        );
        await tx.run(
          "UPDATE properties SET report_id=$1,updated_at=$2 WHERE id=$3 AND owner_id=$4",
          [revision.id, revision.createdAt, revision.propertyId, who],
        );
      });
      reply.code(201);
      return revision;
    },
  );
  app.get<{ Params: { id: string } }>("/v1/checklists/:id", async (req) => {
    const who = await owner(req);
    const rows = await db.all(
      "SELECT c.data FROM checklist c JOIN properties p ON p.id=c.property_id WHERE c.property_id=$1 AND c.owner_id=$2 AND p.owner_id=$2",
      [req.params.id, who],
    );
    return rows[0] ? JSON.parse(String(rows[0].data)) : {};
  });
  app.patch<{ Params: { id: string } }>("/v1/checklists/:id", async (req) => {
    const who = await owner(req),
      data = z.record(z.string().max(100), z.boolean()).parse(req.body);
    if (Object.keys(data).length > 100)
      throw new HttpError(400, "Demasiados elementos.");
    const rows = await db.all(
      "SELECT id FROM properties WHERE id=$1 AND owner_id=$2",
      [req.params.id, who],
    );
    if (!rows[0]) throw new HttpError(404, "Inmueble no encontrado.");
    await db.run(
      "INSERT INTO checklist(owner_id,property_id,data) VALUES($1,$2,$3) ON CONFLICT(owner_id,property_id) DO UPDATE SET data=excluded.data",
      [who, req.params.id, JSON.stringify(data)],
    );
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>(
    "/v1/reports/:id/shares",
    async (req, reply) => {
      const who = await owner(req);
      await reportFor(req.params.id, who);
      const raw = token(),
        id = randomUUID(),
        expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString();
      await db.run(
        "INSERT INTO shares(token_hash,id,owner_id,report_id,expires_at) VALUES($1,$2,$3,$4,$5)",
        [hash(raw), id, who, req.params.id, expiresAt],
      );
      reply.code(201);
      return { id, url: `${webOrigin}/#/compartido/${raw}`, expiresAt };
    },
  );
  app.get<{ Params: { token: string } }>(
    "/v1/shared/:token",
    async (req, reply) => {
      const rows = await db.all(
        "SELECT r.data,s.expires_at,s.revoked FROM shares s JOIN reports r ON r.id=s.report_id WHERE s.token_hash=$1",
        [hash(req.params.token)],
      );
      if (!rows[0] || rows[0].revoked || String(rows[0].expires_at) < now())
        throw new HttpError(
          404,
          "Este enlace no está disponible o ha caducado.",
        );
      reply
        .header("X-Robots-Tag", "noindex")
        .header("Referrer-Policy", "no-referrer")
        .header("Cache-Control", "no-store");
      const report = parseReport(rows[0]);
      return report.marketAnalysis
        ? {
            ...report,
            marketAnalysis: { ...report.marketAnalysis, comparables: [] },
          }
        : report;
    },
  );
  app.get("/v1/market-references", async (req) => {
    const who = await owner(req);
    const rows = await db.all(
      "SELECT * FROM market_references WHERE owner_id=$1 ORDER BY as_of DESC, imported_at DESC LIMIT 1000",
      [who],
    );
    return rows.map(marketReferenceView);
  });
  app.post("/v1/market-references/import", async (req, reply) => {
    const who = await owner(req);
    const body = z
      .object({
        authorized: z.literal(true),
        references: z.array(marketReferenceInputSchema).min(1).max(200),
      })
      .parse(req.body);
    const importedAt = now();
    const references = body.references.map((reference) => ({
      ...reference,
      id: randomUUID(),
      importedAt,
    }));
    await db.transaction(async (tx) => {
      for (const reference of references)
        await tx.run(
          "INSERT INTO market_references(id,owner_id,geography,geography_key,geography_level,rent_per_m2,as_of,sample_size,dispersion,source_label,usage_terms,imported_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            reference.id,
            who,
            reference.geography,
            geographyKey(reference.geography),
            reference.level,
            reference.rentPerM2,
            reference.asOf,
            reference.sampleSize,
            reference.dispersion,
            reference.sourceLabel,
            reference.usageTerms,
            reference.importedAt,
          ],
        );
    });
    reply.code(201);
    return { imported: references.length, references };
  });
  app.delete<{ Params: { id: string } }>(
    "/v1/market-references/:id",
    async (req) => {
      const who = await owner(req);
      await db.run(
        "DELETE FROM market_references WHERE id=$1 AND owner_id=$2",
        [req.params.id, who],
      );
      return { ok: true };
    },
  );
  app.get("/v1/sale-area-references", async (req) => {
    const who = await owner(req);
    const rows = await db.all(
      "SELECT * FROM sale_area_references WHERE owner_id=$1 ORDER BY as_of DESC, imported_at DESC LIMIT 1000",
      [who],
    );
    return rows.map(saleAreaReferenceView);
  });
  app.post("/v1/sale-area-references/import", async (req, reply) => {
    const who = await owner(req);
    const body = z
      .object({
        authorized: z.literal(true),
        references: z.array(saleAreaReferenceInputSchema).min(1).max(200),
      })
      .parse(req.body);
    const importedAt = now();
    const references = body.references.map((reference) => ({
      ...reference,
      id: randomUUID(),
      importedAt,
    }));
    await db.transaction(async (tx) => {
      for (const reference of references)
        await tx.run(
          "INSERT INTO sale_area_references(id,owner_id,geography,geography_key,geography_level,sale_price_per_m2,as_of,sample_size,source_label,usage_terms,imported_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          [
            reference.id,
            who,
            reference.geography,
            geographyKey(reference.geography),
            reference.level,
            reference.salePricePerM2,
            reference.asOf,
            reference.sampleSize,
            reference.sourceLabel,
            reference.usageTerms,
            reference.importedAt,
          ],
        );
    });
    reply.code(201);
    return { imported: references.length, references };
  });
  app.delete<{ Params: { id: string } }>(
    "/v1/sale-area-references/:id",
    async (req) => {
      const who = await owner(req);
      await db.run(
        "DELETE FROM sale_area_references WHERE id=$1 AND owner_id=$2",
        [req.params.id, who],
      );
      return { ok: true };
    },
  );
  app.get("/v1/comparables", async (req) => {
    const who = await owner(req);
    const rows = await db.all(
      "SELECT * FROM property_comparables WHERE owner_id=$1 ORDER BY observed_at DESC LIMIT 5000",
      [who],
    );
    return rows.map(comparableView);
  });
  app.post("/v1/comparables/import", async (req, reply) => {
    const who = await owner(req);
    const body = z
      .object({
        authorized: z.literal(true),
        comparables: z.array(comparableListingInputSchema).min(1).max(500),
      })
      .parse(req.body);
    const importedAt = now();
    const comparables = body.comparables.map((item) => ({
      ...item,
      id: randomUUID(),
      importedAt,
    }));
    await db.transaction(async (tx) => {
      for (const item of comparables)
        await tx.run(
          "INSERT INTO property_comparables(id,owner_id,listing_key,geography,geography_key,property_type,price,area,bedrooms,observed_at,source_label,usage_terms,imported_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
          [
            item.id,
            who,
            item.listingKey ?? null,
            item.geography,
            geographyKey(item.geography),
            item.propertyType,
            item.price,
            item.area,
            item.bedrooms,
            item.observedAt,
            item.sourceLabel,
            item.usageTerms,
            item.importedAt,
          ],
        );
    });
    reply.code(201);
    return { imported: comparables.length, comparables };
  });
  app.delete<{ Params: { id: string } }>("/v1/comparables/:id", async (req) => {
    const who = await owner(req);
    await db.run(
      "DELETE FROM property_comparables WHERE id=$1 AND owner_id=$2",
      [req.params.id, who],
    );
    return { ok: true };
  });
  app.get("/v1/shares", async (req) => {
    const who = await owner(req);
    return db.all(
      "SELECT id,report_id,expires_at,revoked FROM shares WHERE owner_id=$1",
      [who],
    );
  });
  app.delete<{ Params: { id: string } }>("/v1/shares/:id", async (req) => {
    const who = await owner(req);
    await db.run("UPDATE shares SET revoked=1 WHERE id=$1 AND owner_id=$2", [
      req.params.id,
      who,
    ]);
    return { ok: true };
  });
  app.post("/v1/examples", async (req) => {
    const who = await owner(req);
    return Promise.all(examples.map((snapshot) => enqueue(who, { snapshot })));
  });
  return { app, workOnce };
}
