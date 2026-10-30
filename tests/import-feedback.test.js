import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDate,
  mappingConflicts,
  validateTable,
  financialCurrency,
} from "../aynor-onboarding-frontend/source/shared/table-data.mjs";
import { columns } from "../aynor-onboarding-frontend/source/server/sheets-validation.mjs";
import {
  detectTable,
  finalizePlan,
  applyAnswer,
} from "../aynor-onboarding-frontend/source/server/automatic-mapping.mjs";
import { businessOverview } from "../aynor-onboarding-frontend/source/shared/business-overview.mjs";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
test("common full dates parse independent of numeric date order; yearless dates require a chosen year and invalid dates remain invalid", () => {
  for (const value of [
    "Oct 2, 2026",
    "2 October 2026",
    "2nd Oct 2026",
    "02-Oct-2026",
    "Oct. 2, 2026",
    "2026-10-02",
    "2026/10/2",
    "2026-10-02 12:30:45",
  ])
    assert.equal(parseDate(value, "mdy"), "2026-10-02", value);
  assert.equal(parseDate("Oct 2", "mdy"), null);
  assert.equal(parseDate("Oct 2", "mdy", 2026), "2026-10-02");
  assert.equal(parseDate("2/10", "dmy", 2026), "2026-10-02");
  for (const value of ["Feb 30 2026", "2026-02-30", "2026-10-02T99:00:00Z"])
    assert.equal(parseDate(value), null, value);
  assert.equal(parseDate("Feb 29", "ymd", 2024), "2024-02-29");
  assert.equal(parseDate("Feb 29", "ymd", 2026), null);
});
test("year and order questions work in either order, stay lossless until resolved, and independent columns retain independent years", () => {
  const data = [
    ["Request Date", "Target Date", "Status"],
    ["Oct 2", "Oct 9", "Done"],
    ["Sep 20", "Nov 1", "Open"],
  ];
  let plan = detectTable(data, {
    title: "Projects",
    tabId: 0,
    parentTitle: "Master Sheet 2026",
    departments: ["Sales", "Finance"],
  });
  assert.deepEqual(
    plan.questions.map((q) => q.kind),
    ["date_year", "date_year"],
  );
  assert.ok(!plan.questions.some((q) => q.kind === "department"));
  let result = applyAnswer(plan, "year:0", "2026", data, ["Sales", "Finance"]);
  result = applyAnswer(result.plan, "year:1", "2027", data, [
    "Sales",
    "Finance",
  ]);
  assert.equal(result.table.rows[0][0], "2026-10-02");
  assert.equal(result.table.rows[0][1], "2027-10-09");
  const numeric = [
    ["Date", "Item"],
    ["02/10", "A"],
  ];
  for (const order of [
    ["year:0", "date:0"],
    ["date:0", "year:0"],
  ]) {
    let next = {
      plan: detectTable(numeric, {
        title: "Events",
        tabId: 0,
        departments: [],
      }),
    };
    for (const id of order)
      next = applyAnswer(
        next.plan,
        id,
        id.startsWith("year") ? "2026" : "dmy",
        numeric,
        [],
      );
    assert.equal(next.table.rows[0][0], "2026-10-02");
  }
});
test("field conflict checks inspect the complete dataset and all columns, with bounded messages; chosen year fixes the actual saved table", () => {
  const rows = [
    ["Request Date", "Count"],
    ...Array.from({ length: 105 }, () => ["Oct 2", 7]),
    ["bad", "unknown"],
  ];
  let check = mappingConflicts(
    rows,
    { headerRow: 0, properties: ["date", "number"], dateFormat: "mdy" },
    columns,
  );
  assert.equal(check.total, 107);
  assert.equal(check.issues.length, 50);
  check = mappingConflicts(
    rows,
    {
      headerRow: 0,
      properties: ["date", "number"],
      dateFormat: "mdy",
      dateYear: 2026,
    },
    columns,
  );
  assert.equal(check.total, 2);
  assert.equal(check.issues[0].row, 107);
  assert.equal(check.issues[1].name, "Count");
  const table = validateTable(
    rows.slice(0, -1),
    {
      headerRow: 0,
      types: ["date", "number"],
      dateFormat: "mdy",
      dateYear: 2026,
    },
    columns,
  );
  assert.equal(table.rows[104][0], "2026-10-02");
});
test("business KPIs combine validated measures by currency, withhold duplicate financial pages until chosen and ignore arbitrary numeric fields", () => {
  const financial = (
    sourceId,
    currency,
    revenue,
    costs,
    date = "2026-10-02",
  ) => ({
    sourceId,
    tabId: 0,
    title: sourceId,
    currency,
    financial: { points: [{ date, revenue, costs }] },
  });
  const tables = [
    financial("a", "USD", 100, 30),
    financial("b", "USD", 200, 40),
    financial("c", "EUR", 50, 10),
    { sourceId: "ids", rows: [["00001", 9999]], types: ["text", "number"] },
  ];
  let s = businessOverview(tables, "PKR");
  assert.equal(s.groups.length, 2);
  assert.equal(s.groups[0].revenue, 300);
  assert.equal(s.groups[0].profit, 230);
  assert.equal(s.groups[1].revenue, 50);
  s = businessOverview([...tables, financial("copy", "USD", 100, 30)], "PKR");
  assert.deepEqual(s.conflicts, ["a:0", "copy:0"]);
  assert.equal(s.groups[0].revenue, 200);
  s = businessOverview([...tables, financial("copy", "USD", 100, 30)], "PKR", [
    "a:0",
    "b:0",
  ]);
  assert.equal(s.groups[0].revenue, 300);
  assert.throws(
    () =>
      financialCurrency(
        [
          ["Date", "Revenue", "Expenses", "Currency"],
          ["2026-10-01", 100, 10, "USD"],
          ["2026-10-02", 100, 10, "EUR"],
        ],
        ["Date", "Revenue", "Expenses", "Currency"],
        ["date", "money_in", "money_out", "text"],
      ),
    /multiple currencies/,
  );
});
test("catalog checks, duplicate responses and workbook department assignment persist across cold instances and allow individual unassigned overrides", async (t) => {
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
          try {
            data = JSON.parse(raw);
          } catch {
            data = raw;
          }
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
  const id = (
    await call("/companies", "POST", {
      name: "Import feedback",
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    })
  ).data.id;
  await f.pg.query(
    "UPDATE public.aynor_companies SET data=jsonb_set(data,'{departments}','[\"Finance\",\"QA\"]') WHERE id=$1",
    [id],
  );
  const root = `/companies/${id}/sources`;
  const input = {
    mode: "upload",
    name: "Master 2026.xlsx",
    sheets: [
      {
        name: "Projects",
        rows: [
          ["Request Date", "Count"],
          ["Oct 2", 5],
        ],
      },
      {
        name: "Tasks",
        rows: [
          ["Name", "Count"],
          ["A", 2],
        ],
      },
    ],
  };
  const added = await call(root, "POST", input);
  assert.equal(added.status, 200, JSON.stringify(added.data));
  const source = added.data.selectedId;
  await call(`${root}/${source}/prepare`, "POST", {});
  const duplicate = await call(root, "POST", input);
  assert.equal(duplicate.data.duplicate, true);
  assert.equal(duplicate.data.unchanged, true);
  assert.equal(duplicate.data.sources.length, 1);
  const assigned = await call(`${root}/${source}/department`, "POST", {
    department: "QA",
  });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.data));
  assert.ok(assigned.data.sources[0].tabs.every((t) => t.department === "QA"));
  let check = await call(`${root}/${source}/check`, "POST", {
    tabId: 0,
    properties: ["date", "number"],
    dateFormat: "mdy",
  });
  assert.equal(check.data.total, 1);
  check = await call(`${root}/${source}/check`, "POST", {
    tabId: 0,
    properties: ["date", "number"],
    dateFormat: "mdy",
    dateYear: 2026,
  });
  assert.equal(check.data.total, 0);
  const saved = await call(`${root}/${source}/map`, "POST", {
    tables: [
      {
        tabId: 0,
        properties: ["date", "number"],
        dateFormat: "mdy",
        dateYear: 2026,
        department: "",
      },
    ],
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  app = createApplication({ env, fetchImpl: f.fetchImpl });
  const reloaded = await call(root);
  assert.equal(reloaded.data.sources[0].department, "QA");
  assert.equal(reloaded.data.sources[0].tabs[0].department, "");
  assert.equal(reloaded.data.sources[0].tabs[1].department, "QA");
  const overview = await call(`/companies/${id}/sheets/overview?period=all`);
  assert.equal(overview.data.data.tables[0].rows[0][0], "2026-10-02");
  assert.equal(
    (
      await call(`${root}/${source}/department`, "POST", {
        department: "Invented",
      })
    ).status,
    422,
  );
  const serial = (Date.parse("2026-10-02") - Date.UTC(1899, 11, 30)) / 86400000;
  const remoteRows = [
    ["Request Date", "Count"],
    ...Array.from({ length: 105 }, () => ["Oct 2", 5]),
    ["not a date", 7],
  ];
  const paths = [];
  let gridUnavailable = false;
  const fetchImpl = async (input, options) => {
    const url = new URL(String(input));
    if (url.hostname === "sheets.googleapis.com") {
      paths.push(decodeURIComponent(url.toString()));
      if (url.pathname.includes("/values/"))
        return new Response(
          JSON.stringify({ values: remoteRows.map((r) => [...r]) }),
          { headers: { "Content-Type": "application/json" } },
        );
      if (url.searchParams.has("includeGridData") && gridUnavailable)
        return new Response(
          JSON.stringify({ error: { message: "Date metadata unavailable" } }),
          { status: 503 },
        );
      if (url.searchParams.has("includeGridData"))
        return new Response(
          JSON.stringify({
            sheets: [
              {
                data: [
                  {
                    startRow: 1,
                    startColumn: 0,
                    rowData: Array.from({ length: 105 }, () => ({
                      values: [
                        {
                          effectiveValue: { numberValue: serial },
                          effectiveFormat: { numberFormat: { type: "DATE" } },
                        },
                      ],
                    })),
                  },
                ],
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
    }
    return f.fetchImpl(input, options);
  };
  app = createApplication({ env, fetchImpl });
  const consent = await call(`/companies/${id}/sheets/authorize`, "POST", {});
  const state = new URL(consent.data.url).searchParams.get("state");
  assert.equal(
    (
      await call(
        "/integrations/google/callback?state=" + state + "&code=fixture",
      )
    ).status,
    303,
  );
  const connected = await call(root, "POST", {
    mode: "oauth",
    url: "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
  });
  assert.equal(connected.status, 200, JSON.stringify(connected.data));
  const googleSource = connected.data.selectedId;
  const inspected = await call(`${root}/${googleSource}/inspect`, "POST", {
    tabId: 0,
  });
  assert.equal(
    inspected.data.preview[0][0],
    "2026-10-02",
    "Google typed dates retain their underlying year despite yearless display",
  );
  const checked = await call(`${root}/${googleSource}/check`, "POST", {
    tabId: 0,
    properties: ["date", "number"],
    dateFormat: "ymd",
  });
  assert.equal(checked.data.total, 1, JSON.stringify(checked.data));
  assert.equal(
    checked.data.issues[0].row,
    107,
    "Remote field checks include rows after the preview boundary",
  );
  assert.ok(paths.some((p) => p.includes("A1:BA10101")));
  gridUnavailable = true;
  const fallback = await call(`${root}/${googleSource}/inspect`, "POST", {
    tabId: 0,
  });
  assert.equal(fallback.status, 200, JSON.stringify(fallback.data));
  assert.equal(
    fallback.data.preview[0][0],
    "Oct 2",
    "Unavailable optional metadata retains readable original values",
  );
});
