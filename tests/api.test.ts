import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../apps/api/src/app.js";
import { openDatabase } from "../apps/api/src/database.js";
import { examples } from "../packages/fixtures/src/index.js";

const contexts: {
  app: Awaited<ReturnType<typeof createApi>>["app"];
  close: () => Promise<void>;
}[] = [];
async function setup() {
  const db = await openDatabase({ file: ":memory:" });
  const api = await createApi(db, { runWorker: false });
  contexts.push({
    app: api.app,
    close: async () => {
      await api.app.close();
      await db.close();
    },
  });
  const session = await api.app.inject({ method: "GET", url: "/v1/session" });
  const setCookie = session.headers["set-cookie"]!;
  const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(
    ";",
  )[0];
  return { ...api, cookie };
}
afterEach(async () => {
  while (contexts.length) await contexts.pop()!.close();
});

describe("API local y persistente", () => {
  it("conecta extensión con código de un solo uso, restringido al origen de extensión", async () => {
    const { app, cookie } = await setup();
    const pairing = await app.inject({
      method: "POST",
      url: "/v1/pairing",
      headers: { cookie, origin: "http://127.0.0.1:4173" },
    });
    expect(pairing.statusCode).toBe(200);
    const { code } = pairing.json();
    const blocked = await app.inject({
      method: "POST",
      url: "/v1/installations",
      headers: { origin: "https://evil.example" },
      payload: { code },
    });
    expect(blocked.statusCode).toBe(403);
    const installed = await app.inject({
      method: "POST",
      url: "/v1/installations",
      headers: {
        origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      },
      payload: { code },
    });
    expect(installed.statusCode).toBe(200);
    const bearer = installed.json().token as string;
    expect(bearer).toHaveLength(43);
    const reused = await app.inject({
      method: "POST",
      url: "/v1/installations",
      headers: {
        origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
      },
      payload: { code },
    });
    expect(reused.statusCode).toBe(401);
    const revoked = await app.inject({
      method: "DELETE",
      url: "/v1/installations/current",
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(revoked.statusCode).toBe(200);
    const disconnected = await app.inject({
      method: "GET",
      url: "/v1/properties",
      headers: { authorization: `Bearer ${bearer}` },
    });
    expect(disconnected.statusCode).toBe(401);
  });

  it("procesa un informe, conserva revisiones y revoca un enlace compartido", async () => {
    const { app, cookie, workOnce } = await setup();
    const headers = { cookie, origin: "http://127.0.0.1:4173" };
    const created = await app.inject({
      method: "POST",
      url: "/v1/analysis-jobs",
      headers,
      payload: { snapshot: examples[0] },
    });
    expect(created.statusCode).toBe(202);
    await workOnce();
    const job = await app.inject({
      method: "GET",
      url: `/v1/analysis-jobs/${created.json().id}`,
      headers,
    });
    expect(job.json().status).toBe("completed");
    const original = await app.inject({
      method: "GET",
      url: `/v1/reports/${job.json().reportId}`,
      headers,
    });
    expect(original.statusCode).toBe(200);
    const scenario = { ...original.json().scenario, price: 180000 };
    const revision = await app.inject({
      method: "POST",
      url: `/v1/reports/${job.json().reportId}/scenarios`,
      headers,
      payload: scenario,
    });
    expect(revision.statusCode).toBe(201);
    expect(revision.json().parentId).toBe(original.json().id);
    const unchanged = await app.inject({
      method: "GET",
      url: `/v1/reports/${job.json().reportId}`,
      headers,
    });
    expect(unchanged.json().scenario.price).toBe(examples[0].price);
    const share = await app.inject({
      method: "POST",
      url: `/v1/reports/${job.json().reportId}/shares`,
      headers,
    });
    const rawToken = new URL(share.json().url).hash.split("/").at(-1);
    expect(
      (await app.inject({ method: "GET", url: `/v1/shared/${rawToken}` }))
        .statusCode,
    ).toBe(200);
    await app.inject({
      method: "DELETE",
      url: `/v1/shares/${share.json().id}`,
      headers,
    });
    expect(
      (await app.inject({ method: "GET", url: `/v1/shared/${rawToken}` }))
        .statusCode,
    ).toBe(404);
  });

  it("rechaza solicitudes de mutación sin un origen de aplicación permitido", async () => {
    const { app } = await setup();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/examples",
          headers: { origin: "https://evil.example" },
        })
      ).statusCode,
    ).toBe(403);
  });
});
