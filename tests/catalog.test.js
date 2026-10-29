import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
test("source catalog keeps simultaneous methods and unmapped tabs, validates all pages and preserves reports during refresh", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "owner@example.test",
    INITIAL_OWNER_PASSWORD: "a-long-test-password-only",
    GOOGLE_CLIENT_ID: "fixture",
    GOOGLE_CLIENT_SECRET: "fixture",
    GOOGLE_REDIRECT_URI:
      "https://aynor.example/api/integrations/google/callback",
    SHEETS_ENCRYPTION_KEY: "ab".repeat(32),
  };
  let app = createApplication({ env, fetchImpl: f.fetchImpl }),
    cookie = "";
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
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
        },
      },
    );
    return { status, data, headers };
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
      name: "Catalog",
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    })
  ).data.id;
  const workspace = (await call(`/companies/${company}`)).data;
  await call(`/companies/${company}/onboarding`, "PUT", {
    ...workspace.data,
    departments: ["Finance", "QA"],
  });
  // Use the exact versioned onboarding route below if the frontend contract changes.
  await f.pg.query(
    "UPDATE public.aynor_companies SET data=jsonb_set(data,'{departments}','[\"Finance\",\"QA\"]') WHERE id=$1",
    [company],
  );
  const root = `/companies/${company}/sources`,
    sheetRoot = `/companies/${company}/sheets`;
  const uploaded = await call(root, "POST", {
    mode: "upload",
    name: "Tests.xlsx",
    sheets: [
      {
        name: "Cases",
        rows: [
          ["Case", "Date"],
          ["A", "29/10/2026"],
        ],
      },
      {
        name: "Bugs",
        rows: [
          ["Bug", "Date"],
          ["B", "bad"],
        ],
      },
    ],
  });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data));
  const upload = uploaded.data.sources[0];
  assert.equal(upload.tabs.length, 2);
  assert.equal(upload.tabs[0].mapped, false);
  const shared = await call(root, "POST", {
    mode: "public",
    url: "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
    title: "Public finance",
  });
  assert.equal(shared.status, 200, JSON.stringify(shared.data));
  assert.equal(shared.data.sources.length, 2);
  const consent = await call(sheetRoot + "/authorize", "POST", {}),
    state = new URL(consent.data.url).searchParams.get("state");
  assert.equal(
    (
      await call(
        "/integrations/google/callback?state=" + state + "&code=fixture",
      )
    ).status,
    303,
  );
  const privateSource = await call(root, "POST", {
    mode: "oauth",
    url: "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
  });
  assert.equal(privateSource.status, 200, JSON.stringify(privateSource.data));
  assert.equal(privateSource.data.sources.length, 3);
  assert.equal(privateSource.data.account.email, "sheets-owner@example.test");
  const id = privateSource.data.sources.find((s) => s.mode === "oauth").id;
  assert.equal(
    (await call(`${root}/${upload.id}/inspect`, "POST", { tabId: 0 })).data
      .parentTitle,
    "Tests.xlsx",
  );
  const bad = await call(`${root}/${upload.id}/map`, "POST", {
    tables: [
      {
        tabId: 0,
        properties: ["text", "date"],
        department: "QA",
        dateFormat: "mdy",
      },
      {
        tabId: 1,
        properties: ["text", "date"],
        department: "QA",
        dateFormat: "mdy",
      },
    ],
  });
  assert.equal(bad.status, 422, JSON.stringify(bad.data));
  assert.match(bad.data.error, /Cases:/);
  assert.match(bad.data.error, /Bugs:/);
  const mapped = await call(`${root}/${upload.id}/map`, "POST", {
    tables: [
      {
        tabId: 0,
        properties: ["text", "date"],
        department: "QA",
        dateFormat: "dmy",
      },
    ],
  });
  assert.equal(mapped.status, 200, JSON.stringify(mapped.data));
  assert.equal(mapped.data.sources.length, 3);
  assert.equal(mapped.data.sources[0].tabs[0].department, "QA");
  assert.equal(mapped.data.sources[0].tabs[1].mapped, false);
  app = createApplication({ env, fetchImpl: f.fetchImpl });
  assert.equal((await call(root)).data.sources.length, 3);
  const finance = await call(`${root}/${id}/map`, "POST", {
    tables: [
      {
        tabId: 0,
        properties: ["date", "money_in", "money_out"],
        department: "Finance",
        dateFormat: "ymd",
      },
    ],
  });
  assert.equal(finance.status, 200, JSON.stringify(finance.data));
  const report = (await call(sheetRoot + "/overview?period=all")).data;
  assert.equal(report.data.tables.length, 2);
  assert.equal(
    report.data.tables.find((t) => t.department === "Finance").financial.totals
      .revenue,
    500,
  );
  f.control.googleRows = () => [
    ["Date", "Revenue", "Expenses"],
    ["2026-10-29", 800, 300],
  ];
  await f.pg.query(
    "UPDATE public.aynor_sheet_connections SET last_attempt=0 WHERE company_id=$1",
    [company],
  );
  assert.equal((await call(`${root}/${id}/sync`, "POST", {})).status, 200);
  const updated = (await call(root)).data.sources.find((s) => s.id === id);
  assert.equal(updated.tabs[0].changes.updated, 1);
  f.control.googleRows = () => [
    ["Date", "Revenue", "Expenses"],
    ["bad", 800, 300],
  ];
  await f.pg.query(
    "UPDATE public.aynor_sheet_connections SET last_attempt=0 WHERE company_id=$1",
    [company],
  );
  assert.equal((await call(`${root}/${id}/sync`, "POST", {})).status, 200);
  assert.equal(
    (await call(sheetRoot + "/overview?period=all")).data.data.tables.find(
      (t) => t.department === "Finance",
    ).financial.totals.revenue,
    800,
  );
  assert.ok(
    (await call(root)).data.sources.find((s) => s.id === id).tabs[0].error,
  );
  assert.equal(
    (
      await call(sheetRoot + "/public", "POST", {
        url: "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
      })
    ).status,
    409,
  );
  f.control.googleRows = () => [
    ["Date", "Expenses", "Revenue"],
    ["2026-10-29", 300, 800],
  ];
  await call(`${root}/${id}/sync`, "POST", {});
  assert.match(
    (await call(root)).data.sources.find((s) => s.id === id).tabs[0].error,
    /order changed/,
  );
  assert.equal(
    (await call(sheetRoot + "/overview?period=all")).data.data.tables.find(
      (t) => t.department === "Finance",
    ).financial.totals.revenue,
    800,
  );
  const removed = await call(`${root}/${upload.id}`, "DELETE", {});
  assert.equal(removed.status, 200, JSON.stringify(removed.data));
  assert.equal(removed.data.sources.length, 2);
});

test("legacy reports survive catalog adoption; active sync retains data and serializes concurrent source edits", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "migration@example.test",
    INITIAL_OWNER_PASSWORD: "migration-password-long",
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
  await call("/auth/login", "POST", {
    email: env.INITIAL_OWNER_EMAIL,
    password: env.INITIAL_OWNER_PASSWORD,
  });
  const id = (
    await call("/companies", "POST", {
      name: "Migration",
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    })
  ).data.id;
  const company = (await call(`/companies/${id}`)).data;
  assert.equal(
    (
      await call(`/companies/${id}`, "PATCH", {
        version: company.version,
        data: { ...company.data, departments: ["Finance"] },
      })
    ).status,
    200,
  );
  const sheets = `/companies/${id}/sheets`,
    sources = `/companies/${id}/sources`;
  assert.equal(
    (
      await call(sheets + "/upload", "POST", {
        name: "Old.csv",
        tabTitle: "Old finance",
        values: [
          ["Date", "Revenue", "Expenses"],
          ["2026-10-29", 2500, 900],
        ],
        mapping: { date: "Date", revenue: "Revenue", expenses: "Expenses" },
      })
    ).status,
    200,
  );
  const staged = await call(sources, "POST", {
    mode: "public",
    url: "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
    title: "Shared new",
  });
  assert.equal(staged.status, 200, JSON.stringify(staged.data));
  assert.equal(staged.data.sources.length, 2);
  const legacy = staged.data.sources.find(
    (s) => s.legacy || s.mode === "upload",
  );
  assert.equal(legacy.tabs[0].mapped, true);
  assert.equal(
    (await call(sheets + "/overview?period=all")).data.data.tables[0].financial
      .totals.revenue,
    2500,
  );
  const publicId = staged.data.sources.find((s) => s.mode === "public").id;
  assert.equal(
    (
      await call(`${sources}/${publicId}/map`, "POST", {
        tables: [
          {
            tabId: 0,
            properties: ["date", "money_in", "money_out"],
            dateFormat: "ymd",
            department: "Finance",
          },
        ],
      })
    ).status,
    200,
  );
  let release;
  f.control.hold = new Promise((resolve) => (release = resolve));
  const baseline = f.control.googleCalls;
  const syncing = call(`${sources}/${publicId}/sync`, "POST", {});
  for (let i = 0; i < 100 && f.control.googleCalls === baseline; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(f.control.googleCalls > baseline);
  const whileSyncing = await call(sheets + "/overview?period=all");
  assert.equal(whileSyncing.status, 200);
  assert.equal(whileSyncing.data.data.tables.length, 2);
  assert.equal(whileSyncing.data.source.status, "syncing");
  const overlapping = await call(sources, "POST", {
    mode: "upload",
    name: "Concurrent.csv",
    sheets: [{ name: "Data", rows: [["Name"], ["A"]] }],
  });
  assert.equal(overlapping.status, 409);
  release();
  await syncing;
  f.control.hold = null;
  assert.equal((await call(sources)).data.sources.length, 2);
  await f.pg.query(
    "UPDATE public.aynor_members SET role='Viewer' WHERE company_id=$1",
    [id],
  );
  assert.equal((await call(sources)).status, 403);
  assert.equal(
    (await call(`${sources}/${publicId}/inspect`, "POST", { tabId: 0 })).status,
    403,
  );
});
