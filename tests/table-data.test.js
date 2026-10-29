import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  profileColumns,
  suggestHeader,
  validateTable,
  tableSummary,
  validateRelationships,
} from "../aynor-onboarding-frontend/source/shared/table-data.mjs";
import {
  columns,
  validateRows,
} from "../aynor-onboarding-frontend/source/server/sheets-validation.mjs";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
test("table profiling preserves meaning and explicit locale choices", () => {
  const rows = [
    ["ORCA test cases"],
    [],
    ["Case", "Status", "Run date", "Score", "Notes"],
    ["Signup", "Passed", "03/04/2026", 98, null],
    ["Login", "Failed", "13/04/2026", 85, "Retry"],
  ];
  assert.equal(suggestHeader(rows), 2);
  const profiles = profileColumns(columns(rows.slice(2)), rows.slice(3));
  assert.equal(profiles[2].type, "text");
  assert.equal(profiles[2].ambiguousDate, true);
  assert.equal(profiles[3].type, "number");
  assert.equal(parseDate("29.10.2026", "dmy"), "2026-10-29");
  assert.equal(parseDate("2026-10-29T14:30:00+05:00"), "2026-10-29");
  assert.equal(parseDate("2026-10-29T99:99:99Z"), null);
  assert.equal(parseDate(46324, "excel"), "2026-10-29");
  assert.equal(parseDate(60, "excel"), null);
  assert.equal(parseDate("03/04/2026"), null);
  assert.equal(parseDate("03/04/2026", "dmy"), "2026-04-03");
  assert.equal(parseDate("03/04/2026", "mdy"), "2026-03-04");
  assert.equal(parseDate("31/02/2026", "dmy"), null);
  const table = validateTable(
    rows,
    {
      title: "QA",
      headerRow: 2,
      types: ["text", "text", "date", "number", "ignore"],
      dateFormat: "dmy",
      purpose: "Testing",
    },
    columns,
  );
  assert.equal(table.rowCount, 2);
  assert.equal(table.headers.length, 4);
  assert.equal(table.rows[1][2], "2026-04-13");
  const report = tableSummary({ tables: [table] });
  assert.deepEqual(report.tables[0].columns[1].categories, [
    ["Passed", 1],
    ["Failed", 1],
  ]);
  assert.throws(
    () =>
      validateTable(
        rows,
        {
          headerRow: 2,
          types: ["text", "text", "date", "number", "text"],
          dateFormat: "mdy",
        },
        columns,
      ),
    /Row 5/,
  );
  const financial = validateRows(
    [
      ["Monthly report"],
      ["When", "Sales", "Bills"],
      ["29/10/2026", "$1,000", 250],
    ],
    {
      date: "When",
      revenue: "Sales",
      expenses: "Bills",
      _headerRow: "1",
      _dateFormat: "dmy",
    },
  );
  assert.equal(financial.points[0].date, "2026-10-29");
  assert.equal(financial.points[0].revenue, 1000);
});
test("multi-table imports persist with real SQL and reject bad replacements without damaging saved data", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    NODE_ENV: "production",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "table@example.test",
    INITIAL_OWNER_PASSWORD: "table-only-password-long",
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
            data = raw ? JSON.parse(raw) : null;
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
      name: "Tables",
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    })
  ).data.id;
  const root = `/companies/${company}/sheets`;
  const input = {
    mode: "upload",
    name: "Operations.xlsx",
    tables: [
      {
        tabId: 0,
        title: "QA",
        headerRow: 1,
        types: ["text", "text", "date"],
        dateFormat: "dmy",
        purpose: "Testing",
      },
      {
        tabId: 1,
        title: "Stock",
        headerRow: 0,
        types: ["text", "number"],
        dateFormat: "ymd",
        purpose: "Inventory",
      },
    ],
    uploaded: [
      {
        tabId: 0,
        values: [
          ["Test suite"],
          ["Case", "Status", "Date"],
          ["Signup", "Passed", "29/10/2026"],
          ["Login", "Failed", null],
        ],
      },
      {
        tabId: 1,
        values: [
          ["Product", "Units"],
          ["Desk", 12],
          ["Chair", 0],
        ],
      },
    ],
  };
  let saved = await call(root + "/tables", "POST", input);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.dataKind, "tables");
  assert.equal(saved.data.hasSnapshot, true);
  app = createApplication({ env, fetchImpl: f.fetchImpl });
  const report = (await call(root + "/overview")).data.data;
  assert.equal(report.kind, "tables");
  assert.equal(report.tables.length, 2);
  assert.equal(report.tables[0].rows[0][2], "2026-10-29");
  assert.equal(report.tables[1].rows[1][1], 0);
  const bad = structuredClone(input);
  bad.uploaded[1].values[1][1] = "oops";
  assert.equal((await call(root + "/tables", "POST", bad)).status, 422);
  assert.deepEqual((await call(root + "/overview")).data.data, report);
  for (const tables of [[], [null], [input.tables[0], input.tables[0]]])
    assert.equal(
      (await call(root + "/tables", "POST", { ...input, tables })).status,
      422,
    );
  assert.equal((await call(root + "/sync", "POST", {})).status, 409);
  // Private worksheets use the same persisted table config on subsequent syncs.
  const auth = await call(root + "/authorize", "POST", {});
  const state = new URL(auth.data.url).searchParams.get("state");
  assert.equal(
    (await call("/integrations/google/callback?state=" + state + "&code=test"))
      .status,
    303,
  );
  const inspected = await call(root + "/inspect", "POST", {
    url: "1234567890123456789012345",
  });
  assert.equal(inspected.status, 200);
  const privateImport = await call(root + "/tables", "POST", {
    mode: "oauth",
    url: "1234567890123456789012345",
    tables: [
      {
        tabId: 0,
        title: "Finance",
        headerRow: 0,
        types: ["date", "number", "number"],
        dateFormat: "ymd",
        purpose: "Finance",
      },
    ],
  });
  assert.equal(privateImport.status, 200, JSON.stringify(privateImport.data));
  assert.equal(
    (await call(root + "/overview")).data.data.tables[0].headers[0],
    "Date",
  );
  // Lease cooldown is persisted in the actual DB, not bypassed by the app.
  await f.pg.query(
    "UPDATE public.aynor_sheet_connections SET last_attempt=0 WHERE company_id=$1",
    [company],
  );
  assert.equal((await call(root + "/sync", "POST", {})).status, 200);
  assert.equal(
    (
      await call(root + "/tables", "POST", {
        mode: "public",
        url: "https://evil.example/data.csv",
        tables: input.tables,
      })
    ).status,
    400,
  );
});

test("table relationships require matching types, real matches and unique reference keys", () => {
  const configs = [{ tabId: 5 }, { tabId: 8 }];
  const tables = [
    {
      title: "Orders",
      headers: ["Customer ID"],
      types: ["text"],
      rows: [["A"], ["A"], ["B"], [null]],
    },
    {
      title: "Customers",
      headers: ["ID"],
      types: ["text"],
      rows: [["A"], ["B"]],
    },
  ];
  const link = { from: 5, to: 8, fromColumn: "Customer ID", toColumn: "ID" };
  assert.equal(validateRelationships(tables, configs, [link])[0].matched, 3);
  const duplicate = structuredClone(tables);
  duplicate[1].rows.push(["A"]);
  assert.throws(
    () => validateRelationships(duplicate, configs, [link]),
    /duplicate keys/,
  );
  const mismatch = structuredClone(tables);
  mismatch[1].types[0] = "number";
  assert.throws(
    () => validateRelationships(mismatch, configs, [link]),
    /same type/,
  );
  const none = structuredClone(tables);
  none[1].rows = [["X"]];
  assert.throws(
    () => validateRelationships(none, configs, [link]),
    /no matching/,
  );
  assert.throws(
    () => validateRelationships(tables, configs, [{ ...link, to: 5 }]),
    /different/,
  );
  const ranged = validateTable(
    [["Name", "Count"], ["A", 2], [], ["Notes", "not numeric"]],
    { headerRow: 0, endRow: 3, types: ["text", "number"] },
    columns,
  );
  assert.equal(ranged.rowCount, 1);
  assert.throws(
    () =>
      validateTable(
        [["Name", "Count"], ["A", 2], [], ["B", "bad"]],
        { headerRow: 0, types: ["text", "number"] },
        columns,
      ),
    /Row 4/,
  );
});
