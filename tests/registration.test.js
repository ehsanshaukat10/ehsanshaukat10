import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
test("confirmed email signup, native sessions, logout, isolation and existing owner access", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    NODE_ENV: "production",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "owner@example.test",
    INITIAL_OWNER_PASSWORD: "owner-password-for-test-only",
  };
  const app = createApplication({ env, fetchImpl: f.fetchImpl });
  async function call(path, method = "GET", body, cookie = "") {
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
        writeHead(s, h) {
          status = s;
          headers = h;
        },
        end(raw) {
          data = raw ? JSON.parse(raw) : null;
        },
      },
    );
    return {
      status,
      data,
      headers,
      cookie: headers["Set-Cookie"]?.split(";")[0],
    };
  }
  const owner = await call("/auth/login", "POST", {
    email: env.INITIAL_OWNER_EMAIL,
    password: env.INITIAL_OWNER_PASSWORD,
  });
  assert.equal(owner.status, 200);
  const ownerCompany = (
    await call(
      "/companies",
      "POST",
      {
        name: "Private owner company",
        industry: "Technology",
        country: "Pakistan",
        currency: "PKR",
        timezone: "Asia/Karachi",
      },
      owner.cookie,
    )
  ).data.id;
  const signup = {
    name: "Second Account",
    email: "another@example.test",
    password: "another-password-for-test",
  };
  const registered = await call("/auth/signup", "POST", signup);
  assert.equal(registered.status, 201);
  assert.equal(registered.data.verificationRequired, true);
  assert.equal(registered.cookie, undefined);
  assert.equal(
    (await f.pg.query("SELECT count(*)::int as count FROM public.aynor_users"))
      .rows[0].count,
    1,
  );
  assert.equal(
    (await call("/auth/login", "POST", { ...signup, password: "incorrect" }))
      .status,
    401,
  );
  assert.equal((await call("/auth/login", "POST", signup)).status, 403);
  assert.equal(
    (await call("/auth/resend", "POST", { email: signup.email })).status,
    200,
  );
  f.control.authUsers.get(signup.email).email_confirmed_at =
    new Date().toISOString();
  const logged = await call("/auth/login", "POST", signup);
  assert.equal(logged.status, 200);
  assert.equal(logged.data.user.name, signup.name);
  assert.equal(logged.data.user.verified, true);
  assert.match(logged.headers["Set-Cookie"], /HttpOnly; Secure; SameSite=Lax/);
  assert.ok(!JSON.stringify(logged.data).includes("private-provider"));
  assert.deepEqual(
    (await call("/companies", "GET", undefined, logged.cookie)).data,
    [],
  );
  assert.equal(
    (await call("/companies/" + ownerCompany, "GET", undefined, logged.cookie))
      .status,
    403,
  );
  assert.equal(
    (await call("/auth/logout", "POST", {}, logged.cookie)).status,
    200,
  );
  assert.equal(
    (await call("/companies", "GET", undefined, logged.cookie)).status,
    401,
  );
  assert.equal(
    (await call("/auth/logout", "POST", {}, logged.cookie)).status,
    200,
  );
  assert.equal((await call("/auth/logout", "POST", {})).status, 200);
  assert.equal(
    (await call("/companies", "GET", undefined, owner.cookie)).data[0].id,
    ownerCompany,
  );
  assert.equal(
    (
      await call("/auth/signup", "POST", {
        ...signup,
        email: env.INITIAL_OWNER_EMAIL,
      })
    ).status,
    409,
  );
  f.control.authUsers.get(signup.email).password =
    "changed-in-provider-password";
  assert.equal((await call("/auth/login", "POST", signup)).status, 401);
  assert.equal(
    (
      await call("/auth/login", "POST", {
        ...signup,
        password: "changed-in-provider-password",
      })
    ).status,
    200,
  );
});
test("delivery limits, unauthorized sender and provider details are handled without verification bypasses", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const app = createApplication({
    env: {
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    },
    fetchImpl: f.fetchImpl,
  });
  async function signup(email) {
    let status, data;
    await app(
      {
        url: "/api/auth/signup",
        method: "POST",
        body: { name: "Tester", email, password: "a-valid-password-long" },
        headers: { host: "aynor.example" },
        socket: {},
      },
      {
        writeHead(s) {
          status = s;
        },
        end(raw) {
          data = JSON.parse(raw);
        },
      },
    );
    return { status, data };
  }
  f.control.authError = "email_address_not_authorized";
  const blocked = await signup("blocked@example.test");
  assert.equal(blocked.status, 503);
  assert.match(blocked.data.error, /custom SMTP/);
  assert.ok(!blocked.data.error.includes("private provider"));
  f.control.authError = "over_email_send_rate_limit";
  assert.equal((await signup("limited@example.test")).status, 429);
  assert.equal(
    (await f.pg.query("SELECT count(*)::int as count FROM public.aynor_users"))
      .rows[0].count,
    0,
  );
});
