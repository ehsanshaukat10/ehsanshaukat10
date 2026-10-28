import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
import { createDatabase } from "../aynor-onboarding-frontend/source/server/database.mjs";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
const secret = "a-long-test-password-only",
  url =
    "https://docs.google.com/spreadsheets/d/e/2PACXabcdefghijklmnopqrstuvwx/pub?output=csv&gid=0";
test("Supabase-backed serverless application: identity, isolation, atomic saves, leases and manual reporting", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    NODE_ENV: "production",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "owner@example.test",
    INITIAL_OWNER_PASSWORD: secret,
  };
  const db = createDatabase({ env, fetchImpl: f.fetchImpl });
  let app = createApplication({ env, fetchImpl: f.fetchImpl });
  const call = async (
    path,
    method = "GET",
    body,
    cookie = "",
    headers = {},
  ) => {
    let status, result, setCookie;
    const req = {
      url: "/api" + path,
      method,
      headers: {
        host: "aynor.example",
        ...(cookie ? { cookie } : {}),
        ...headers,
      },
      body: body ?? undefined,
      socket: { remoteAddress: "127.0.0.1" },
    };
    const res = {
      writeHead(code, h) {
        status = code;
        setCookie = h["Set-Cookie"];
      },
      end(value) {
        result = value ? JSON.parse(value) : null;
      },
    };
    await app(req, res);
    return {
      status,
      data: result,
      cookie: setCookie?.split(";")[0],
      setCookie,
    };
  };
  const health = await call("/health");
  assert.equal(health.status, 200);
  assert.equal((await call("/handler.js?route=health")).status, 200);
  assert.equal((await call("/dev/session", "POST", {})).status, 403);
  assert.equal(
    (
      await call(
        "/auth/login",
        "POST",
        { email: "owner@example.test", password: secret },
        "",
        { origin: "https://evil.example" },
      )
    ).status,
    403,
  );
  const login = await call("/auth/login", "POST", {
    email: "owner@example.test",
    password: secret,
  });
  assert.equal(login.status, 200);
  assert.match(login.setCookie, /Secure/);
  assert.equal(login.data.user.password, undefined);
  const cookie = login.cookie,
    actor = login.data.user.id;
  app = createApplication({ env, fetchImpl: f.fetchImpl });
  assert.equal(
    (await call("/session", "GET", undefined, cookie)).data.user.id,
    actor,
  );
  const companyBody = {
    name: "Aynor real data",
    industry: "Technology",
    country: "Pakistan",
    currency: "PKR",
    timezone: "Asia/Karachi",
  };
  const created = await call("/companies", "POST", companyBody, cookie, {
    "idempotency-key": "repeat",
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(
    (
      await call("/companies", "POST", companyBody, cookie, {
        "idempotency-key": "repeat",
      })
    ).data.id,
    id,
  );
  const config = { ...created.data.data, departments: ["Finance"] };
  const patch = await call(
    "/companies/" + id,
    "PATCH",
    { version: 1, data: config },
    cookie,
  );
  assert.equal(patch.status, 200);
  assert.equal(
    (
      await call(
        "/companies/" + id,
        "PATCH",
        { version: 1, data: config },
        cookie,
      )
    ).status,
    409,
  );
  const outsider = randomUUID();
  await f.pg.query(
    "INSERT INTO public.aynor_users(id,email,name,password,verified) VALUES($1,'outsider@example.test','Outsider','not-a-password',true)",
    [outsider],
  );
  const outsiderToken = "unrelated-session";
  await f.pg.query("INSERT INTO public.aynor_sessions VALUES($1,$2,$3)", [
    createHash("sha256").update(outsiderToken).digest("hex"),
    outsider,
    Date.now() + 60000,
  ]);
  assert.equal(
    (
      await call(
        "/companies/" + id + "/sheets/overview",
        "GET",
        undefined,
        "aynor_session=" + outsiderToken,
      )
    ).status,
    403,
  );
  const inspected = await call(
    "/companies/" + id + "/sheets/public",
    "POST",
    { url },
    cookie,
  );
  assert.equal(inspected.status, 200);
  const mapped = await call(
    "/companies/" + id + "/sheets/mapping",
    "PUT",
    {
      spreadsheetId: inspected.data.spreadsheetId,
      tabId: 0,
      mapping: { date: "Date", revenue: "Revenue", expenses: "Expenses" },
    },
    cookie,
  );
  assert.equal(mapped.status, 200);
  assert.equal(mapped.data.syncMode, "manual");
  assert.equal(mapped.data.status, "synced");
  const report = await call(
    "/companies/" + id + "/sheets/overview?period=quarter",
    "GET",
    undefined,
    cookie,
  );
  assert.equal(report.data.data.totals.revenue, 3000);
  assert.equal(report.data.data.totals.profit, 1800);
  assert.equal(
    (await call("/companies/" + id + "/sheets/sync", "POST", {}, cookie))
      .status,
    429,
  );
  await f.pg.query(
    "UPDATE public.aynor_sheet_connections SET last_attempt=0 WHERE company_id=$1",
    [id],
  );
  f.control.csv = "Date,Revenue,Expenses\nnot-a-date,100,5";
  assert.equal(
    (await call("/companies/" + id + "/sheets/sync", "POST", {}, cookie))
      .status,
    422,
  );
  assert.equal(
    (
      await call(
        "/companies/" + id + "/sheets/overview",
        "GET",
        undefined,
        cookie,
      )
    ).data.data.totals.revenue,
    3000,
  );
  await f.pg.query(
    "UPDATE public.aynor_sheet_connections SET last_attempt=0 WHERE company_id=$1",
    [id],
  );
  f.control.csv = null;
  let release;
  f.control.hold = new Promise((r) => (release = r));
  const sync = call("/companies/" + id + "/sheets/sync", "POST", {}, cookie);
  for (let i = 0; i < 100; i++) {
    const current = (
      await f.pg.query(
        "SELECT status FROM public.aynor_sheet_connections WHERE company_id=$1",
        [id],
      )
    ).rows[0];
    if (current.status === "syncing") break;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(
    (await call("/companies/" + id + "/sheets/sync", "POST", {}, cookie))
      .status,
    409,
  );
  await call("/companies/" + id + "/sheets", "DELETE", {}, cookie);
  release();
  await sync;
  assert.equal(
    (
      await call(
        "/companies/" + id + "/sheets/overview",
        "GET",
        undefined,
        cookie,
      )
    ).data.data,
    null,
  );
  // Actual browser roles cannot execute privileged RPCs.
  await f.pg.exec("RESET ROLE;SET ROLE anon");
  await assert.rejects(
    () =>
      f.pg.query("SELECT public.aynor_company_create($1,$2,$3,$4)", [
        actor,
        "{}",
        "{}",
        "attack",
      ]),
    (e) => e.code === "42501",
  );
  await f.pg.exec("RESET ROLE;SET ROLE service_role");
  // A scoped member can open its workspace but not read financial snapshots.
  await f.pg.query(
    "INSERT INTO public.aynor_members VALUES($1,$2,'Viewer','[\"Finance\"]')",
    [id, outsider],
  );
  const scoped = await call(
    "/companies/" + id,
    "GET",
    undefined,
    "aynor_session=" + outsiderToken,
  );
  assert.equal(scoped.status, 200);
  assert.equal(scoped.data.data.sources, undefined);
  assert.equal(
    (
      await call(
        "/companies/" + id + "/sheets/overview",
        "GET",
        undefined,
        "aynor_session=" + outsiderToken,
      )
    ).status,
    403,
  );
  assert.equal((await call("/auth/logout", "POST", {}, cookie)).status, 200);
  assert.equal(
    (await call("/session", "GET", undefined, cookie)).data.user,
    null,
  );
  const before = (
    await f.pg.query(
      "SELECT count(*)::int AS count FROM public.aynor_companies",
    )
  ).rows[0].count;
  await f.pg.exec("RESET ROLE");
  const { readFileSync } = await import("node:fs");
  await f.pg.exec(
    readFileSync(
      new URL(
        "../supabase/migrations/202610270002_serverless_operations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    (
      await f.pg.query(
        "SELECT count(*)::int AS count FROM public.aynor_companies",
      )
    ).rows[0].count,
    before,
  );
});

test("serverless private Sheets: bound OAuth, encrypted credentials, refresh and revoked access recovery", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    NODE_ENV: "production",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "owner@example.test",
    INITIAL_OWNER_PASSWORD: secret,
    GOOGLE_CLIENT_ID: "fixture-client",
    GOOGLE_CLIENT_SECRET: "fixture-secret",
    GOOGLE_REDIRECT_URI:
      "https://aynor.example/api/integrations/google/callback",
    SHEETS_ENCRYPTION_KEY: "ab".repeat(32),
  };
  const app = createApplication({ env, fetchImpl: f.fetchImpl });
  async function call(path, method = "GET", body, cookie = "") {
    let code, data, headers;
    await app(
      {
        url: "/api" + path,
        method,
        body,
        headers: { host: "aynor.example", ...(cookie ? { cookie } : {}) },
        socket: {},
      },
      {
        writeHead(c, h) {
          code = c;
          headers = h;
        },
        end(value) {
          data = value ? JSON.parse(value) : null;
        },
      },
    );
    return {
      code,
      data,
      headers,
      cookie: headers["Set-Cookie"]?.split(";")[0],
    };
  }
  const login = await call("/auth/login", "POST", {
      email: "owner@example.test",
      password: secret,
    }),
    cookie = login.cookie;
  const created = await call(
      "/companies",
      "POST",
      {
        name: "Private report",
        industry: "Technology",
        country: "Pakistan",
        currency: "PKR",
        timezone: "Asia/Karachi",
      },
      cookie,
    ),
    base = "/companies/" + created.data.id + "/sheets";
  const consent = await call(
    base + "/authorize",
    "POST",
    { returnTo: "mapping" },
    cookie,
  );
  assert.equal(consent.code, 200);
  const state = new URL(consent.data.url).searchParams.get("state");
  // Changing the destination invalidates the whole state without consuming
  // the legitimate pending grant.
  assert.equal(
    (
      await call(
        "/integrations/google/callback?state=" +
          state.replace(".mapping", ".connections") +
          "&code=test",
        "GET",
        undefined,
        cookie,
      )
    ).code,
    400,
  );
  assert.equal(
    new URL(consent.data.url).searchParams.get("scope"),
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  );
  assert.equal(
    (
      await call(
        "/integrations/google/callback?state=" + state + "&code=wrong",
        "GET",
        undefined,
        "aynor_session=invalid",
      )
    ).code,
    401,
  );
  f.control.tokenLifetime = -120;
  const callback = await call(
    "/integrations/google/callback?state=" + state + "&code=test",
    "GET",
    undefined,
    cookie,
  );
  assert.equal(callback.code, 303);
  assert.equal(
    callback.headers.Location,
    `/companies/${created.data.id}/onboarding/mapping?google=connected`,
  );
  assert.equal(
    (
      await call(
        "/integrations/google/callback?state=" + state + "&code=test",
        "GET",
        undefined,
        cookie,
      )
    ).code,
    400,
  );
  const record = (
    await f.pg.query("SELECT credentials FROM public.aynor_sheet_connections")
  ).rows[0];
  assert.ok(!record.credentials.includes("fixture-access"));
  f.control.tokenLifetime = 3600;
  const inspected = await call(
    base + "/inspect",
    "POST",
    { url: "abcdefghijklmnopqrstuvwx1234" },
    cookie,
  );
  assert.equal(inspected.code, 200);
  assert.equal(f.control.tokens, 2);
  const mapped = await call(
    base + "/mapping",
    "PUT",
    {
      spreadsheetId: inspected.data.spreadsheetId,
      tabId: 0,
      mapping: { date: "Date", revenue: "Revenue", expenses: "Expenses" },
    },
    cookie,
  );
  assert.equal(mapped.code, 200);
  const report = await call(base + "/overview", "GET", undefined, cookie);
  assert.equal(report.data.data.totals.revenue, 500);
  assert.ok(!JSON.stringify(report.data).includes("fixture-access"));
  // Expire the token and revoke the provider grant; retain the valid snapshot.
  const { createGoogle } =
    await import("../aynor-onboarding-frontend/source/server/google.mjs");
  const db = createDatabase({ env, fetchImpl: f.fetchImpl }),
    google = createGoogle({ db, env, fetchImpl: f.fetchImpl });
  const c = await db.one("sheet_connections", {
    company_id: "eq." + created.data.id,
  });
  const credentials = google.open(c.credentials);
  await db.update(
    "sheet_connections",
    { company_id: "eq." + created.data.id },
    {
      credentials: google.seal({ ...credentials, expires: 0 }),
      last_attempt: 0,
    },
  );
  f.control.invalidGrant = true;
  assert.equal((await call(base + "/sync", "POST", {}, cookie)).code, 401);
  const status = await call(base, "GET", undefined, cookie);
  assert.equal(status.data.status, "reauth_required");
  assert.equal(status.data.hasSnapshot, true);
  assert.equal(
    (await call("/session", "GET", undefined, cookie)).data.user.id,
    login.data.user.id,
  );
  const cancelled = await call(
    base + "/authorize",
    "POST",
    { returnTo: "integrations" },
    cookie,
  );
  const cancelledState = new URL(cancelled.data.url).searchParams.get("state");
  const cancelledCallback = await call(
    "/integrations/google/callback?state=" +
      cancelledState +
      "&error=access_denied",
    "GET",
    undefined,
    cookie,
  );
  assert.equal(
    cancelledCallback.headers.Location,
    `/companies/${created.data.id}/onboarding/integrations?google=cancelled`,
  );
  assert.equal(
    (await call(base, "GET", undefined, cookie)).data.hasSnapshot,
    true,
  );
  env.GOOGLE_REDIRECT_URI =
    "https://different.example/api/integrations/google/callback";
  assert.equal((await call(base + "/authorize", "POST", {}, cookie)).code, 409);
  delete env.GOOGLE_CLIENT_SECRET;
  const missing = await call(base, "GET", undefined, cookie);
  assert.equal(missing.data.configured, false);
  assert.deepEqual(missing.data.googleSetup.missing, ["GOOGLE_CLIENT_SECRET"]);
  assert.ok(!JSON.stringify(missing.data).includes("fixture-client"));
  assert.equal((await call(base + "/authorize", "POST", {}, cookie)).code, 503);
});

test("owner configuration errors identify the failing setting without exposing or changing credentials", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const base = {
    NODE_ENV: "production",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "owner@example.test",
    INITIAL_OWNER_PASSWORD: secret,
  };
  async function login(overrides = {}, supplied = secret) {
    let status, data;
    const app = createApplication({
      env: { ...base, ...overrides },
      fetchImpl: f.fetchImpl,
    });
    await app(
      {
        url: "/api/auth/login",
        method: "POST",
        headers: { host: "aynor.example" },
        socket: { remoteAddress: "fixture" },
        body: { email: "owner@example.test", password: supplied },
      },
      {
        writeHead(s) {
          status = s;
        },
        end(value) {
          data = JSON.parse(value);
        },
      },
    );
    return { status, data };
  }
  for (const [overrides, expected] of [
    [{ INITIAL_OWNER_EMAIL: "" }, /INITIAL_OWNER_EMAIL is missing/],
    [
      { INITIAL_OWNER_EMAIL: "INITIAL_OWNER_EMAIL" },
      /INITIAL_OWNER_EMAIL is not a valid/,
    ],
    [{ INITIAL_OWNER_PASSWORD: "" }, /INITIAL_OWNER_PASSWORD is missing/],
    [
      { INITIAL_OWNER_PASSWORD: "too-short" },
      /INITIAL_OWNER_PASSWORD is too short/,
    ],
    [
      { INITIAL_OWNER_PASSWORD: "x".repeat(201) },
      /INITIAL_OWNER_PASSWORD exceeds/,
    ],
  ]) {
    const result = await login(overrides);
    assert.equal(result.status, 503);
    assert.match(result.data.error, expected);
    assert.ok(!result.data.error.includes(secret));
  }
  assert.equal((await login()).status, 200);
  const original = (
    await f.pg.query(
      "SELECT password FROM public.aynor_users WHERE email='owner@example.test'",
    )
  ).rows[0].password;
  assert.equal(
    (
      await login(
        { INITIAL_OWNER_PASSWORD: "different-strong-password" },
        "different-strong-password",
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await f.pg.query(
        "SELECT password FROM public.aynor_users WHERE email='owner@example.test'",
      )
    ).rows[0].password,
    original,
  );
});
