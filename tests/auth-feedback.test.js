import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
test("verified email callbacks create secure sessions and password recovery requires valid proof and revokes old sessions", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
  };
  let cookie = "";
  const app = createApplication({ env, fetchImpl: f.fetchImpl });
  async function call(path, method = "GET", body) {
    let status, data, headers;
    await app(
      {
        url: "/api" + path,
        method,
        body,
        headers: { host: "aynor.example", cookie },
        socket: {},
      },
      {
        writeHead(c, h) {
          status = c;
          headers = h;
          if (h["Set-Cookie"]) cookie = h["Set-Cookie"].split(";")[0];
        },
        end(raw) {
          data = raw ? JSON.parse(raw) : null;
        },
      },
    );
    return { status, data, headers };
  }
  const email = "customer@example.test",
    oldPassword = "original-password-long";
  assert.equal(
    (
      await call("/auth/signup", "POST", {
        email,
        password: oldPassword,
        name: "Customer",
      })
    ).status,
    201,
  );
  assert.equal((await call("/auth/confirm", "POST", {})).status, 403);
  const identity = f.control.authUsers.get(email);
  f.control.authTokens.set("unconfirmed-proof", email);
  assert.equal(
    (await call("/auth/confirm", "POST", { accessToken: "unconfirmed-proof" }))
      .status,
    403,
  );
  assert.equal((await call("/session")).data.user, null);
  identity.email_confirmed_at = new Date().toISOString();
  f.control.authTokens.set("valid-confirmation-proof", email);
  const confirmed = await call("/auth/confirm", "POST", {
    accessToken: "valid-confirmation-proof",
    next: "/companies/new",
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.destination, "/companies/new");
  assert.equal(confirmed.data.user.verified, true);
  assert.match(confirmed.headers["Set-Cookie"], /HttpOnly; Secure/);
  assert.equal(
    (
      await call("/auth/confirm", "POST", {
        accessToken: "valid-confirmation-proof",
      })
    ).status,
    403,
  );
  const oldCookie = cookie;
  assert.equal((await call("/auth/recover", "POST", { email })).status, 200);
  assert.equal(
    (await call("/auth/recover", "POST", { email: "unknown@example.test" }))
      .status,
    200,
  );
  assert.equal(
    (
      await call("/auth/reset", "POST", {
        accessToken: "wrong-proof",
        password: "new-password-long",
      })
    ).status,
    403,
  );
  f.control.recoveryTokens.set("valid-recovery-proof", email);
  assert.equal(
    (
      await call("/auth/reset", "POST", {
        accessToken: "valid-recovery-proof",
        password: "new-password-long",
      })
    ).status,
    200,
  );
  assert.equal(identity.password, "new-password-long");
  cookie = oldCookie;
  assert.equal((await call("/session")).data.user, null);
  assert.equal(
    (
      await call("/auth/reset", "POST", {
        accessToken: "valid-recovery-proof",
        password: "another-new-password",
      })
    ).status,
    429,
  );
  assert.equal(identity.password, "new-password-long");
  assert.equal(
    (await call("/auth/login", "POST", { email, password: oldPassword }))
      .status,
    401,
  );
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email,
        password: "new-password-long",
      })
    ).status,
    200,
  );
});

test("legacy operators recover by proving their email, without changing identity or pre-confirming the provider account", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "legacy-owner@example.test",
    INITIAL_OWNER_PASSWORD: "legacy-owner-password-long",
  };
  const app = createApplication({ env, fetchImpl: f.fetchImpl });
  let cookie = "";
  async function call(path, method = "GET", body) {
    let status, data;
    await app(
      {
        url: "/api" + path,
        method,
        body,
        headers: { host: "aynor.example", cookie },
        socket: {},
      },
      {
        writeHead(c, h) {
          status = c;
          if (h["Set-Cookie"]) cookie = h["Set-Cookie"].split(";")[0];
        },
        end(raw) {
          data = raw ? JSON.parse(raw) : null;
        },
      },
    );
    return { status, data };
  }
  const initial = await call("/auth/login", "POST", {
    email: env.INITIAL_OWNER_EMAIL,
    password: env.INITIAL_OWNER_PASSWORD,
  });
  const id = initial.data.user.id;
  assert.equal(
    (await call("/auth/recover", "POST", { email: env.INITIAL_OWNER_EMAIL }))
      .status,
    200,
  );
  const provider = f.control.authUsers.get(env.INITIAL_OWNER_EMAIL);
  assert.ok(provider);
  assert.equal(provider.email_confirmed_at, null);
  f.control.recoveryTokens.set("legacy-reset-proof", env.INITIAL_OWNER_EMAIL);
  assert.equal(
    (
      await call("/auth/reset", "POST", {
        accessToken: "legacy-reset-proof",
        password: "new-legacy-password-long",
      })
    ).status,
    403,
  );
  provider.email_confirmed_at = new Date().toISOString();
  assert.equal(
    (
      await call("/auth/reset", "POST", {
        accessToken: "legacy-reset-proof",
        password: "new-legacy-password-long",
      })
    ).status,
    200,
  );
  const recovered = await call("/auth/login", "POST", {
    email: env.INITIAL_OWNER_EMAIL,
    password: "new-legacy-password-long",
  });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.data.user.id, id);
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: env.INITIAL_OWNER_EMAIL,
        password: env.INITIAL_OWNER_PASSWORD,
      })
    ).status,
    401,
  );
});
