import Fastify, { type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  analysisInputSchema,
  scenarioSchema,
  snapshotSchema,
  type AnalysisJob,
  type AnalysisInput,
  type ReportRevision,
  type PropertySummary,
} from "@fincalens/contracts";
import { CALC_VERSION, createReport } from "@fincalens/domain";
import { examples } from "../../../packages/fixtures/src/index.js";
import { type Database, type Row } from "./database.js";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const now = () => new Date().toISOString();
const token = () => randomBytes(32).toString("base64url");
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

export async function createApi(
  db: Database,
  options: { webOrigin?: string; runWorker?: boolean } = {},
) {
  const webOrigin = options.webOrigin || "http://127.0.0.1:4173";
  const app = Fastify({ logger: false, bodyLimit: 100_000, trustProxy: false });
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
    if (req.cookies.fl_session) {
      const rows = await db.all(
        "SELECT expires_at FROM sessions WHERE hash=$1",
        [hash(req.cookies.fl_session)],
      );
      valid = !!rows[0] && String(rows[0].expires_at) > now();
    }
    if (!valid) {
      const raw = token();
      await db.run(
        "INSERT INTO sessions(hash,owner_id,expires_at) VALUES($1,$2,$3)",
        [
          hash(raw),
          "local-user",
          new Date(Date.now() + 30 * 86400_000).toISOString(),
        ],
      );
      reply.setCookie("fl_session", raw, {
        httpOnly: true,
        sameSite: "strict",
        secure: false,
        path: "/",
        maxAge: 30 * 86400,
      });
    }
    return { mode: "local", displayName: "Mi espacio", marketProvider: false };
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
    "/v1/reports/:id/scenarios",
    async (req, reply) => {
      const who = await owner(req),
        base = await reportFor(req.params.id, who),
        scenario = scenarioSchema.parse(req.body);
      const revision = createReport(base.snapshot, scenario, {
        id: randomUUID(),
        propertyId: base.propertyId,
        parentId: base.id,
        createdAt: now(),
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
      return parseReport(rows[0]);
    },
  );
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
