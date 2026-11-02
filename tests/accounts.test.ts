import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../apps/api/src/app.js";
import { openDatabase } from "../apps/api/src/database.js";
import { examples } from "../packages/fixtures/src/index.js";

const contexts: { close: () => Promise<void> }[] = [];
const origin = "http://127.0.0.1:4173";
const cookieFrom = (headers: string | string[] | undefined) =>
  (Array.isArray(headers) ? headers[0] : headers)?.split(";")[0] || "";

async function setup() {
  const db = await openDatabase({ file: ":memory:" });
  const { app, workOnce } = await createApi(db, {
    authMode: "accounts",
    runWorker: false,
  });
  contexts.push({
    close: async () => {
      await app.close();
      await db.close();
    },
  });
  return { app, workOnce };
}

afterEach(async () => {
  while (contexts.length) await contexts.pop()!.close();
});

describe("cuentas locales y aislamiento de datos", () => {
  it("mantiene cada cartera separada y permite cerrar sesión", async () => {
    const { app, workOnce } = await setup();
    const anonymous = await app.inject({ method: "GET", url: "/v1/session" });
    expect(anonymous.json()).toMatchObject({
      mode: "accounts",
      authenticated: false,
    });
    expect(anonymous.headers["set-cookie"]).toBeUndefined();

    const create = (email: string) =>
      app.inject({
        method: "POST",
        url: "/v1/auth/register",
        headers: { origin },
        payload: { email, password: "correct horse battery staple" },
      });
    const first = await create("uno@example.test");
    expect(first.statusCode).toBe(201);
    expect(first.headers["set-cookie"]).toContain("HttpOnly");
    expect(first.headers["set-cookie"]).toContain("SameSite=Strict");
    const firstCookie = cookieFrom(first.headers["set-cookie"]);
    expect((await create("uno@example.test")).statusCode).toBe(409);

    const job = await app.inject({
      method: "POST",
      url: "/v1/analysis-jobs",
      headers: { origin, cookie: firstCookie },
      payload: { snapshot: examples[0] },
    });
    expect(job.statusCode).toBe(202);
    await workOnce();

    const second = await create("dos@example.test");
    expect(second.statusCode).toBe(201);
    const secondCookie = cookieFrom(second.headers["set-cookie"]);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/properties",
          headers: { cookie: secondCookie },
        })
      ).json(),
    ).toHaveLength(0);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/properties",
          headers: { cookie: firstCookie },
        })
      ).json(),
    ).toHaveLength(1);

    const logout = await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { origin, cookie: secondCookie },
      payload: {},
    });
    expect(logout.statusCode).toBe(200);
    const ended = await app.inject({
      method: "GET",
      url: "/v1/session",
      headers: { cookie: secondCookie },
    });
    expect(ended.json()).toMatchObject({ authenticated: false });
  });

  it("no expone si el correo existe cuando fallan las credenciales", async () => {
    const { app } = await setup();
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: { origin },
      payload: {
        email: "unknown@example.test",
        password: "correct horse battery staple",
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("Correo o contraseña incorrectos.");
  });
});
