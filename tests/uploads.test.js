import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
import { publicSheetUrl } from "../aynor-onboarding-frontend/source/server/sheets-validation.mjs";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";

test("uploaded records are validated, isolated, persisted and replaceable without OAuth or a new migration", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    NODE_ENV: "production",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "upload@example.test",
    INITIAL_OWNER_PASSWORD: "upload-test-password-long",
  };
  let app = createApplication({ env, fetchImpl: f.fetchImpl });
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
        writeHead(code, h) {
          status = code;
          if (h["Set-Cookie"]) cookie = h["Set-Cookie"].split(";")[0];
        },
        end(raw) {
          data = raw ? JSON.parse(raw) : null;
        },
      },
    );
    return { status, data };
  }
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: env.INITIAL_OWNER_EMAIL,
        password: env.INITIAL_OWNER_PASSWORD,
      })
    ).status,
    200,
  );
  const company = (
    await call("/companies", "POST", {
      name: "Upload test",
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    })
  ).data.id;
  const root = "/companies/" + company + "/sheets";
  const now = new Date(),
    date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      .toISOString()
      .slice(0, 10);
  const upload = {
    name: "Business.xlsx",
    tabTitle: "Finance",
    values: [
      ["Date", "Revenue", "Expenses"],
      [date, 1200, 500],
    ],
    mapping: { date: "Date", revenue: "Revenue", expenses: "Expenses" },
  };
  const { mapping, ...preview } = upload;
  assert.equal(
    (await call(root + "/upload", "POST", preview)).data.preview[0][1],
    1200,
  );
  assert.equal((await call(root)).data.connected, false);
  const imported = await call(root + "/upload", "POST", upload);
  assert.equal(imported.status, 200);
  assert.equal(imported.data.mode, "upload");
  assert.equal(imported.data.status, "synced");
  assert.equal(imported.data.mapping.revenue, "Revenue");
  assert.equal((await call(root + "/sync", "POST", {})).status, 409);
  app = createApplication({ env, fetchImpl: f.fetchImpl });
  assert.equal((await call(root + "/overview")).data.data.totals.revenue, 1200);
  const failed = await call(root + "/upload", "POST", {
    ...upload,
    values: [upload.values[0], [date, "bad", 1]],
  });
  assert.equal(failed.status, 422);
  assert.equal((await call(root + "/overview")).data.data.totals.revenue, 1200);
  assert.equal(
    (
      await call(root + "/upload", "POST", {
        ...upload,
        mapping: { ...mapping, date: "Revenue" },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await call(root + "/upload", "POST", {
        ...upload,
        values: [Array(53).fill("x")],
      })
    ).status,
    422,
  );
  assert.equal(
    (await call(root + "/upload", "POST", { ...upload, name: "script.exe" }))
      .status,
    400,
  );
  const many = {
    ...upload,
    values: [
      upload.values[0],
      ...Array.from({ length: 4000 }, () => [date, 2, 1, "memo ".repeat(20)]),
    ],
  };
  assert.ok(JSON.stringify(many).length > 200000);
  assert.equal((await call(root + "/upload", "POST", many)).status, 200);
  assert.equal((await call(root + "/overview")).data.data.totals.revenue, 8000);
  assert.equal(
    (
      await call(root + "/upload", "POST", {
        ...upload,
        name: "x".repeat(3 * 1024 * 1024),
      })
    ).status,
    413,
  );
  assert.equal(
    (await call("/companies", "POST", { name: "x".repeat(210000) })).status,
    413,
  );
  const actualCookie = cookie;
  cookie = "";
  assert.equal((await call(root + "/upload", "POST", upload)).status, 401);
  cookie = actualCookie;
  const sharedUrl =
    "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit#gid=0";
  const inspected = await call(root + "/public", "POST", {
    url: sharedUrl,
    previewOnly: true,
  });
  assert.equal(inspected.status, 200);
  assert.equal((await call(root)).data.mode, "upload");
  assert.equal(
    (await call(root + "/overview?period=all")).data.data.totals.revenue,
    8000,
  );
  f.control.csv = "Date,Revenue,Expenses\ninvalid,5,2";
  const linkMapping = {
    spreadsheetId: inspected.data.spreadsheetId,
    tabId: 0,
    mapping,
    publicUrl: sharedUrl,
  };
  assert.equal((await call(root + "/mapping", "PUT", linkMapping)).status, 422);
  assert.equal((await call(root)).data.mode, "upload");
  assert.equal(
    (await call(root + "/overview?period=all")).data.data.totals.revenue,
    8000,
  );
  f.control.csv = null;
  assert.equal((await call(root + "/mapping", "PUT", linkMapping)).status, 200);
  assert.equal((await call(root)).data.mode, "public");
  assert.equal((await call(root, "DELETE", {})).status, 200);
  assert.equal((await call(root + "/overview")).data.data, null);
});

test("Paste URL accepts shared Google links with tab ids and retains strict host validation", () => {
  const id = "abcdefghijklmnopqrstuvwx1234";
  assert.equal(
    publicSheetUrl(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=12`),
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=12`,
  );
  for (const link of [
    `https://docs.google.com.evil.test/spreadsheets/d/${id}/edit`,
    `http://docs.google.com/spreadsheets/d/${id}/edit`,
    `https://user:pass@docs.google.com/spreadsheets/d/${id}/edit`,
  ])
    assert.throws(() => publicSheetUrl(link));
});
