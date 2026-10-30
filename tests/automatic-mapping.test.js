import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectTable,
  finalizePlan,
  applyAnswer,
  aiMetadata,
  mergeAiSuggestion,
} from "../aynor-onboarding-frontend/source/server/automatic-mapping.mjs";
import { createFreeAi } from "../aynor-onboarding-frontend/source/server/free-ai.mjs";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
test("automatic preparation validates full data, preserves identifiers and asks only meaningful questions", () => {
  const rows = [
    ["Monthly accounts"],
    ["Date", "Revenue", "Expenses", "Invoice ID", "Payment status"],
    ["2026-10-01", 1000, 300, "00012", "Paid"],
    ["2026-10-02", 2000, 600, "00013", "Unpaid"],
  ];
  const plan = detectTable(rows, {
    title: "Finance",
    tabId: 0,
    departments: ["Finance", "QA"],
  });
  assert.equal(plan.headerRow, 1);
  assert.equal(plan.properties[3], "text");
  assert.equal(plan.department, "Finance");
  // Payment status needs a business choice; invoice IDs stay lossless text.
  assert.ok(plan.questions.some((q) => q.kind === "financial"));
  let prepared = finalizePlan(rows, plan, ["Finance", "QA"]);
  assert.equal(prepared.table.financial, undefined);
  assert.equal(prepared.table.rows[0][3], "00012");
  prepared = applyAnswer(prepared.plan, "financial", "recorded", rows, [
    "Finance",
    "QA",
  ]);
  assert.equal(prepared.table.financial.totals.revenue, 3000);
  const simple = [
    ["Date", "Revenue", "Expenses"],
    ["2026-10-29", 1500, 300],
  ];
  const ready = finalizePlan(
    simple,
    detectTable(simple, {
      title: "Report",
      tabId: 0,
      departments: ["Finance"],
    }),
    ["Finance"],
  );
  assert.equal(ready.plan.questions.length, 0);
  assert.equal(ready.table.financial.totals.profit, 1200);
  const ambiguous = [
    ["Date", "Revenue", "Expenses"],
    ["03/04/2026", 1000, 200],
  ];
  const guessed = detectTable(ambiguous, {
    title: "Finance",
    tabId: 0,
    departments: ["Finance"],
  });
  assert.equal(guessed.properties[0], "text");
  assert.equal(guessed.questions[0].kind, "date_order");
  const dated = applyAnswer(guessed, "date:0", "dmy", ambiguous, ["Finance"]);
  assert.equal(dated.table.rows[0][0], "2026-04-03");
  assert.equal(dated.table.financial.totals.revenue, 1000);
  const data = [
    ["Item", "Value"],
    ...Array.from({ length: 120 }, (_, i) => ["Thing", i]),
    ["Last", "not numeric"],
  ];
  const full = finalizePlan(
    data,
    detectTable(data, {
      title: "Other",
      tabId: 2,
      departments: ["Operations"],
    }),
    ["Operations"],
  );
  assert.equal(full.config.types[1], "text");
  assert.equal(full.table.rows.at(-1)[1], "not numeric");
  assert.equal(
    detectTable([["Cover page"]], { title: "Cover", tabId: 1, departments: [] })
      .status,
    "empty",
  );
});
test("AI metadata contains no cell values and model output cannot guess dates, exclude columns or damage IDs", () => {
  const values = [
    ["Person", "Date", "ID"],
    ["private-person@example.com", "03/04/2026", "00023"],
  ];
  const plan = detectTable(values, {
    title: "Testing",
    tabId: 5,
    departments: ["Finance", "QA"],
  });
  const metadata = JSON.stringify(
    aiMetadata([{ plan, values }], ["Finance", "QA"]),
  );
  assert.ok(!metadata.includes("private-person"));
  assert.ok(!metadata.includes("03/04/2026"));
  assert.ok(!metadata.includes("00023"));
  const merged = mergeAiSuggestion(
    plan,
    {
      tabId: 5,
      headerRow: 0,
      department: "QA",
      properties: ["ignore", "date", "number"],
    },
    values,
    ["Finance", "QA"],
  );
  assert.deepEqual(merged.config.types, ["text", "text", "text"]);
  assert.ok(merged.plan.questions.some((q) => q.kind === "date_order"));
  assert.throws(
    () =>
      mergeAiSuggestion(
        plan,
        {
          tabId: 999,
          headerRow: 0,
          department: "QA",
          properties: ["text", "date", "text"],
        },
        values,
        ["Finance", "QA"],
      ),
    /Invalid/,
  );
});
test("AI can propose unfamiliar financial labels but cannot calculate them before explicit confirmation", () => {
  const values = [
    ["Date", "Receipts", "Outgoings"],
    ["2026-10-29", 2500, 900],
  ];
  const plan = detectTable(values, {
    title: "Finance",
    tabId: 7,
    departments: ["Finance"],
  });
  const proposed = mergeAiSuggestion(
    plan,
    {
      tabId: 7,
      headerRow: 0,
      department: "Finance",
      properties: ["date", "money_in", "money_out"],
    },
    values,
    ["Finance"],
  );
  assert.equal(proposed.table.financial, undefined);
  assert.equal(proposed.plan.questions[0].id, "financial:ai");
  const confirmed = applyAnswer(
    proposed.plan,
    "financial:ai",
    "recorded",
    values,
    ["Finance"],
  );
  assert.equal(confirmed.table.financial.totals.profit, 1600);
  const declined = applyAnswer(proposed.plan, "financial:ai", "table", values, [
    "Finance",
  ]);
  assert.equal(declined.table.financial, undefined);
});
test("free-only AI rejects paid models, caps requests and falls back on malformed responses and quota errors", async () => {
  let calls = 0;
  const counts = new Map(),
    db = {
      async rpc(name, { p_key, p_max }) {
        const next = (counts.get(p_key) || 0) + 1;
        counts.set(p_key, next);
        return next <= p_max;
      },
    };
  const env = {
    AYNOR_AI_ENABLED: "true",
    OPENROUTER_API_KEY: "fixture-only-key",
    AYNOR_AI_MODEL: "test/model:free",
    AYNOR_AI_GLOBAL_DAILY_LIMIT: "2",
    AYNOR_AI_WORKSPACE_DAILY_LIMIT: "1",
  };
  const requests = [];
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer fixture-only-key");
    if (url.endsWith("models"))
      return Response.json({
        data: [
          {
            id: "test/model:free",
            pricing: { prompt: "0", completion: "0", request: "0" },
          },
        ],
      });
    calls++;
    const request = JSON.parse(options.body);
    requests.push(request);
    assert.deepEqual(request.provider.max_price, { prompt: 0, completion: 0 });
    assert.equal(request.provider.allow_fallbacks, false);
    assert.equal(request.provider.data_collection, "deny");
    assert.equal(request.model, "test/model:free");
    assert.equal(request.tools, undefined);
    return Response.json({
      model: "test/model:free",
      choices: [
        {
          message: {
            content: JSON.stringify({
              tabs: [
                {
                  tabId: 0,
                  headerRow: 0,
                  department: "QA",
                  properties: ["text"],
                },
              ],
            }),
          },
        },
      ],
    });
  };
  const ai = createFreeAi({ env, db, fetchImpl });
  assert.equal(
    (await ai.classify({ company: "a", metadata: { tabs: [] } })).status,
    "used",
  );
  assert.equal(
    (await ai.classify({ company: "a", metadata: { tabs: [] } })).status,
    "daily_limit",
  );
  assert.equal(
    (await ai.classify({ company: "b", metadata: { tabs: [] } })).status,
    "used",
  );
  assert.equal(
    (await ai.classify({ company: "c", metadata: { tabs: [] } })).status,
    "daily_limit",
  );
  assert.equal(calls, 2);
  const blocked = createFreeAi({
    env: { ...env, AYNOR_AI_MODEL: "test/paid-model" },
    db,
    fetchImpl,
  });
  assert.equal(
    (await blocked.classify({ company: "x", metadata: { tabs: [] } })).status,
    "paid_model_blocked",
  );
  assert.equal(calls, 2);
  const priced = createFreeAi({
    env,
    db,
    fetchImpl: async () =>
      Response.json({
        data: [
          { id: "test/model:free", pricing: { prompt: "1", completion: "0" } },
        ],
      }),
  });
  assert.equal(
    (await priced.classify({ company: "x", metadata: { tabs: [] } })).status,
    "no_free_model",
  );
  for (const limit of ["0", "not-a-number", "-1"]) {
    const disabled = createFreeAi({
      env: { ...env, AYNOR_AI_GLOBAL_DAILY_LIMIT: limit },
      db,
      fetchImpl: () => {
        throw Error("must not fetch");
      },
    });
    assert.equal(
      (await disabled.classify({ company: "z", metadata: {} })).status,
      "daily_limit",
    );
  }
  const unlimitedDb = { rpc: async () => true };
  for (const [mode, expected] of [
    ["invalid", "unavailable"],
    ["quota", "quota"],
  ]) {
    const failed = createFreeAi({
      env,
      db: unlimitedDb,
      fetchImpl: async (url) =>
        url.endsWith("models")
          ? Response.json({
              data: [
                {
                  id: "test/model:free",
                  pricing: { prompt: "0", completion: "0" },
                },
              ],
            })
          : mode === "quota"
            ? Response.json({ error: "private diagnostic" }, { status: 429 })
            : Response.json({
                choices: [{ message: { content: "not JSON" } }],
              }),
    });
    assert.equal(
      (await failed.classify({ company: "x", metadata: { tabs: [] } })).status,
      expected,
    );
  }
  for (const price of [null, false, ""]) {
    const unknownPricing = createFreeAi({
      env,
      db,
      fetchImpl: async () =>
        Response.json({
          data: [
            {
              id: "test/model:free",
              pricing: { prompt: price, completion: "0" },
            },
          ],
        }),
    });
    assert.equal(
      (await unknownPricing.classify({ company: "x", metadata: {} })).status,
      "no_free_model",
    );
  }
  const noConfig = createFreeAi({
    env: {},
    db,
    fetchImpl: () => {
      throw Error("must not call");
    },
  });
  assert.equal(
    (await noConfig.classify({ company: "x", metadata: {} })).status,
    "not_configured",
  );
});
test("real catalog auto preparation imports, persists answers, caches AI interpretation and respects manual overrides", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  let chatCalls = 0;
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "auto@example.test",
    INITIAL_OWNER_PASSWORD: "automatic-password-long",
    AYNOR_AI_ENABLED: "true",
    OPENROUTER_API_KEY: "fixture-only-key",
    AYNOR_AI_MODEL: "test/model:free",
  };
  const fetchImpl = async (url, options) => {
    if (String(url).startsWith("https://openrouter.ai/api/v1/")) {
      if (String(url).endsWith("models"))
        return Response.json({
          data: [
            {
              id: "test/model:free",
              pricing: { prompt: "0", completion: "0" },
            },
          ],
        });
      chatCalls++;
      const input = JSON.parse(JSON.parse(options.body).messages[1].content);
      return Response.json({
        model: "test/model:free",
        choices: [
          {
            message: {
              content: JSON.stringify({
                tabs: input.tabs.map((tab) => ({
                  tabId: tab.tabId,
                  headerRow: tab.headerRow,
                  department: "QA",
                  properties: tab.properties,
                })),
              }),
            },
          },
        ],
      });
    }
    return f.fetchImpl(url, options);
  };
  let app = createApplication({ env, fetchImpl }),
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
  const company = (
    await call("/companies", "POST", {
      name: "Automatic",
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    })
  ).data;
  assert.equal(
    (
      await call(`/companies/${company.id}`, "PATCH", {
        version: company.version,
        data: { ...company.data, departments: ["Finance", "QA"] },
      })
    ).status,
    200,
  );
  const root = `/companies/${company.id}/sources`;
  const source = (
    await call(root, "POST", {
      mode: "upload",
      name: "Test.xlsx",
      sheets: [
        {
          name: "Tickets",
          rows: [
            ["Subject", "State"],
            ["Private customer name", "Open"],
          ],
        },
        {
          name: "Finance",
          rows: [
            ["Date", "Revenue", "Expenses"],
            ["03/04/2026", 500, 200],
          ],
        },
      ],
    })
  ).data.selectedId;
  const automatic = await call(`${root}/${source}/prepare`, "POST", {
    allowAi: true,
  });
  assert.equal(automatic.status, 200, JSON.stringify(automatic.data));
  assert.equal(chatCalls, 1);
  assert.ok(automatic.data.sources[0].tabs.every((tab) => tab.mapped));
  assert.equal(automatic.data.sources[0].tabs[0].automatic.origin, "ai");
  assert.equal(
    automatic.data.sources[0].tabs[1].automatic.questions[0].kind,
    "date_order",
  );
  app = createApplication({ env, fetchImpl });
  assert.equal(
    (await call(`${root}/${source}/prepare`, "POST", { allowAi: true })).status,
    200,
  );
  assert.equal(chatCalls, 1);
  const answered = await call(`${root}/${source}/answer`, "POST", {
    tabId: 1,
    questionId: "date:0",
    value: "mdy",
  });
  assert.equal(answered.status, 200, JSON.stringify(answered.data));
  assert.equal(answered.data.sources[0].tabs[1].automatic.questions.length, 0);
  const overview = (
    await call(`/companies/${company.id}/sheets/overview?period=all`)
  ).data.data;
  assert.equal(overview.tables[1].financial.totals.revenue, 500);
  assert.equal(overview.tables[1].rows[0][0], "2026-03-04");
  assert.equal(
    (
      await call(`${root}/${source}/map`, "POST", {
        tables: [
          {
            tabId: 0,
            headerRow: 0,
            properties: ["text", "text"],
            department: "Finance",
            dateFormat: "ymd",
          },
        ],
      })
    ).status,
    200,
  );
  await call(`${root}/${source}/prepare`, "POST", { allowAi: true });
  assert.equal(
    (await call(root)).data.sources[0].tabs[0].department,
    "Finance",
  );
  assert.equal(chatCalls, 1);
  await f.pg.query(
    "UPDATE public.aynor_members SET role='Viewer' WHERE company_id=$1",
    [company.id],
  );
  assert.equal(
    (await call(`${root}/${source}/prepare`, "POST", {})).status,
    403,
  );
});

test("live AI reports credential and budget rejection safely instead of pretending AI ran", async () => {
  for (const [code, expected] of [
    [401, "invalid_key"],
    [402, "credit_limit"],
    [403, "access_denied"],
    [404, "no_route"],
  ]) {
    const ai = createFreeAi({
      env: { AYNOR_AI_ENABLED: "true", OPENROUTER_API_KEY: "fixture-only" },
      db: { rpc: async () => true },
      fetchImpl: async (url) =>
        String(url).endsWith("/models")
          ? Response.json({
              data: [
                {
                  id: "fixture/model:free",
                  pricing: { prompt: "0", completion: "0" },
                },
              ],
            })
          : new Response(JSON.stringify({ error: "private-provider-detail" }), {
              status: code,
            }),
    });
    const result = await ai.classify({
      company: "fixture-company",
      metadata: { tabs: [] },
    });
    assert.equal(result.status, expected);
    assert.ok(!JSON.stringify(result).includes("private-provider-detail"));
  }
});
