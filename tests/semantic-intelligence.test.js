import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmSemantics,
  currencyEvidence,
  evaluateSemantics,
  proposeSemantics,
  validateSemanticSettings,
} from "../aynor-onboarding-frontend/source/server/semantic-intelligence.mjs";
const now = Date.parse("2026-10-31T12:00:00Z");
const interval = {
  kind: "interval",
  start: "2026-10-01",
  endExclusive: "2026-11-01",
};
const snapshot = { kind: "snapshot", asOf: "2026-10-31" };
const table = (headers, types, rows) => ({
  headers,
  types,
  rows,
  rowCount: rows.length,
  title: "Arbitrary worksheet",
});
const finance = () =>
  table(
    ["Entry", "Booked", "Turnover", "Spend"],
    ["text", "date", "currency", "currency"],
    [
      ["0001", "2026-10-02", 100.1, 20.05],
      ["0002", "2026-10-03", 200.2, 30.05],
    ],
  );
const financialMeaning = {
  purpose: "finance",
  entity: "transaction",
  entityNamespace: "ledger",
  fields: {
    entity_id: "Entry",
    date: "Booked",
    revenue: "Turnover",
    expense: "Spend",
  },
  currency: "USD",
  period: interval,
};
function run(t, meaning, options = {}) {
  const tab = {
    tabId: 1,
    table: t,
    department: options.department || "Custom team",
    lastSuccess: now,
    ...options,
  };
  if (meaning) tab.semantic = confirmSemantics(meaning, t, "owner", now);
  return evaluateSemantics({
    catalog: { sources: [{ id: "source-a", tabs: [tab] }] },
    companyId: "tenant-a",
    now,
    settings: options.settings,
  });
}
const metric = (result, id) => result.metrics.find((m) => m.metricId === id);
test("instructional data and unknown numbers never become semantic executive metrics", () => {
  const instructions = table(
    ["Step", "Status", "Qty"],
    ["text", "text", "number"],
    [
      ["Step 1", "Click connect", 5],
      ["Step 2", "Read instructions", 2],
    ],
  );
  assert.equal(proposeSemantics(instructions).purpose, "reference");
  assert.equal(run(instructions).metrics.length, 0);
  const unknown = table(
    ["SKU", "Rate", "Percentage", "Total"],
    ["text", "number", "percentage", "number"],
    [["0001", 2, 30, 100]],
  );
  assert.equal(run(unknown).metrics.length, 0);
  assert.equal(
    proposeSemantics({ ...unknown, title: "Finance and Sales" }).purpose,
    "other",
  );
});
test("company terminology proposes fields without automatically confirming them", () => {
  const t = finance();
  const settings = validateSemanticSettings({
    fieldAliases: {
      entity_id: ["Entry"],
      date: ["Booked"],
      revenue: ["Turnover"],
      expense: ["Spend"],
    },
  });
  const p = proposeSemantics(t, settings);
  assert.equal(p.purpose, "finance");
  assert.equal(p.fields.revenue, "Turnover");
  assert.equal(p.requiresConfirmation, true);
  assert.ok(
    run(t, undefined, { settings }).metrics.every(
      (m) => m.state === "provisional" && m.value === null,
    ),
  );
  assert.throws(() =>
    validateSemanticSettings({ fieldAliases: { profit: ["Made up"] } }),
  );
});
test("saved column mappings prefill semantic review and instruction tabs stay outside KPIs", () => {
  const t = finance();
  t.headers.push("Currency Code");
  t.types.push("text");
  t.rows.forEach((row) => row.push("USD"));
  const proposal = proposeSemantics(
    t,
    {},
    {
      title: "01 Cash ledger",
      properties: ["text", "date", "money_in", "money_out", "text"],
    },
  );
  assert.equal(proposal.purpose, "finance");
  assert.equal(proposal.fields.date, "Booked");
  assert.equal(proposal.fields.revenue, "Turnover");
  assert.equal(proposal.fields.expense, "Spend");
  assert.equal(proposal.currency, "USD");
  assert.equal(
    proposeSemantics(t, {}, { title: "START HERE" }).purpose,
    "reference",
  );
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(
    run(t).metrics.some(
      (metric) => metric.metricId === "finance.overdue_receivables",
    ),
    false,
  );
});
test("confirmed finance has exact monetary results, period, source lineage and no company default currency", () => {
  const out = run(finance(), financialMeaning);
  assert.equal(metric(out, "finance.revenue").value, 300.3);
  assert.equal(metric(out, "finance.expenses").value, 50.1);
  assert.equal(metric(out, "finance.profit").value, 250.2);
  const m = metric(out, "finance.revenue");
  assert.equal(m.state, "validated");
  assert.equal(m.currency, "USD");
  assert.deepEqual(m.period, interval);
  assert.equal(m.companyId, "tenant-a");
  assert.deepEqual(m.lineage.contributingRows, [0, 1]);
  assert.equal(m.lineage.fields.revenue, "Turnover");
  assert.equal(
    metric(
      run(finance(), { ...financialMeaning, currency: undefined }),
      "finance.revenue",
    ).state,
    "insufficient_data",
  );
  assert.equal(
    metric(
      run(finance(), {
        ...financialMeaning,
        fields: { entity_id: "Entry", date: "Booked" },
      }),
      "finance.revenue",
    ).state,
    "insufficient_data",
  );
});
test("incompatible currencies and schemas are blocked; unrelated scopes are never combined", () => {
  const t = finance();
  t.headers.push("Currency");
  t.types.push("text");
  t.rows[0].push("USD");
  t.rows[1].push("EUR");
  assert.equal(
    metric(run(t, financialMeaning), "finance.revenue").state,
    "provisional",
  );
  const original = finance(),
    semantic = confirmSemantics(financialMeaning, original, "owner", now),
    changed = finance();
  changed.headers[2] = "Different";
  const out = evaluateSemantics({
    companyId: "tenant-a",
    now,
    catalog: {
      sources: [
        {
          id: "a",
          tabs: [{ tabId: 1, table: changed, semantic, lastSuccess: now }],
        },
      ],
    },
  });
  assert.ok(
    out.metrics.every((m) => m.state === "provisional" && m.value === null),
  );
  const sources = ["USD", "EUR"].map((currency, i) => ({
    id: `source-${i}`,
    tabs: [
      {
        tabId: 1,
        table: finance(),
        lastSuccess: now,
        semantic: confirmSemantics(
          { ...financialMeaning, currency, entityNamespace: `ledger${i}` },
          finance(),
          "owner",
          now,
        ),
      },
    ],
  }));
  const separate = evaluateSemantics({
    companyId: "tenant-a",
    now,
    catalog: { sources },
  }).metrics.filter((m) => m.metricId === "finance.revenue");
  assert.equal(separate.length, 2);
  assert.deepEqual(
    separate.map((m) => m.currency),
    ["USD", "EUR"],
  );
  assert.ok(separate.every((m) => m.value === 300.3));
});
test("missing dates, duplicate identifiers, unsafe precision and stale sources do not yield confirmed values", () => {
  const duplicate = finance();
  duplicate.rows[1][0] = "0001";
  assert.equal(
    metric(run(duplicate, financialMeaning), "finance.revenue").state,
    "provisional",
  );
  const invalid = finance();
  invalid.rows[1][1] = "2026-02-30";
  assert.equal(
    metric(run(invalid, financialMeaning), "finance.revenue").state,
    "insufficient_data",
  );
  const missing = finance();
  missing.rows[0][2] = null;
  assert.equal(
    metric(run(missing, financialMeaning), "finance.revenue").value,
    null,
  );
  const unsafe = finance();
  unsafe.rows[0][2] = 900719925474099;
  assert.equal(
    metric(run(unsafe, financialMeaning), "finance.revenue").state,
    "unavailable",
  );
  const fraction = finance();
  fraction.rows[0][2] = 1.001;
  assert.equal(
    metric(run(fraction, financialMeaning), "finance.revenue").state,
    "unavailable",
  );
  assert.equal(
    metric(
      run(finance(), financialMeaning, { lastSuccess: now - 72 * 3600000 }),
      "finance.revenue",
    ).state,
    "stale",
  );
  assert.equal(
    metric(
      run(finance(), financialMeaning, { error: "Refresh failed" }),
      "finance.revenue",
    ).state,
    "stale",
  );
});
test("sales and invoice metrics use explicit business meanings and status vocabularies", () => {
  const t = table(
    ["Opportunity", "Closed", "Value", "Stage"],
    ["text", "date", "currency", "text"],
    [
      ["D1", "2026-10-04", 50, "Signed"],
      ["D2", "2026-10-05", 500, "Rejected"],
    ],
  );
  const meaning = {
    purpose: "sales",
    entity: "deal",
    entityNamespace: "crm",
    fields: {
      entity_id: "Opportunity",
      date: "Closed",
      amount: "Value",
      status: "Stage",
    },
    currency: "GBP",
    period: interval,
    statusValues: { won: ["Signed"], lost: ["Rejected"] },
  };
  assert.equal(metric(run(t, meaning), "sales.won_value").value, 50);
  assert.equal(metric(run(t, meaning), "sales.won_deals").value, 1);
  assert.equal(
    run(t, meaning).metrics.some((m) => m.metricId === "finance.revenue"),
    false,
  );
  assert.equal(
    metric(
      run(t, { ...meaning, statusValues: { won: ["Signed"] } }),
      "sales.won_value",
    ).state,
    "provisional",
  );
  const invoices = table(
    ["Invoice", "Due", "Balance", "State"],
    ["text", "date", "currency", "text"],
    [
      ["I1", "2026-10-30", 80, "Unpaid"],
      ["I2", "2026-10-31", 90, "Unpaid"],
      ["I3", "2026-10-20", 0, "Settled"],
    ],
  );
  const m = {
    purpose: "finance",
    entity: "invoice",
    entityNamespace: "invoices",
    fields: {
      entity_id: "Invoice",
      due_date: "Due",
      outstanding_amount: "Balance",
      status: "State",
    },
    currency: "EUR",
    period: snapshot,
    statusValues: { active: ["Unpaid"], closed: ["Settled"] },
  };
  assert.equal(
    metric(run(invoices, m), "finance.overdue_receivables").value,
    80,
  );
});
test("delivery and resource metrics require unique entities and compatible confirmed periods", () => {
  const t = table(
    ["Job", "Stage", "Target"],
    ["text", "text", "date"],
    [
      ["P1", "Doing", "2026-10-29"],
      ["P2", "Finished", "2026-10-20"],
      ["P3", "Doing", "2026-11-02"],
    ],
  );
  const meaning = {
    purpose: "delivery",
    entity: "project",
    entityNamespace: "jobs",
    fields: { entity_id: "Job", status: "Stage", due_date: "Target" },
    period: snapshot,
    statusValues: { active: ["Doing"], closed: ["Finished"] },
  };
  assert.equal(metric(run(t, meaning), "delivery.active_projects").value, 2);
  assert.equal(metric(run(t, meaning), "delivery.overdue_projects").value, 1);
  const r = table(
    ["Person", "Booked hours", "Capacity"],
    ["text", "number", "number"],
    [
      ["E1", 30, 40],
      ["E2", 10, 40],
    ],
  );
  const rm = {
    purpose: "resources",
    entity: "resource",
    entityNamespace: "people",
    fields: {
      entity_id: "Person",
      assigned_hours: "Booked hours",
      available_hours: "Capacity",
    },
    period: interval,
  };
  assert.equal(metric(run(r, rm), "resources.utilization").value, 50);
  assert.equal(
    metric(run(r, { ...rm, period: snapshot }), "resources.utilization").state,
    "provisional",
  );
  r.rows[1][2] = -40;
  assert.equal(
    metric(run(r, rm), "resources.utilization").state,
    "unavailable",
  );
  assert.throws(() =>
    confirmSemantics(
      { ...rm, fields: { ...rm.fields, available_hours: "Booked hours" } },
      r,
      "owner",
      now,
    ),
  );
});
test("overlapping shared identifiers are blocked and company metric settings are honored", () => {
  const t = finance(),
    s = confirmSemantics(financialMeaning, t, "owner", now);
  const catalog = {
    sources: [
      {
        id: "a",
        tabs: [{ tabId: 1, table: t, semantic: s, lastSuccess: now }],
      },
      {
        id: "b",
        tabs: [{ tabId: 9, table: finance(), semantic: s, lastSuccess: now }],
      },
    ],
  };
  assert.ok(
    evaluateSemantics({ companyId: "tenant-a", catalog, now }).metrics.every(
      (m) => m.state !== "validated" && m.value === null,
    ),
  );
  assert.equal(
    run(t, financialMeaning, {
      settings: { enabledMetrics: ["finance.revenue"] },
    }).metrics.length,
    1,
  );
  assert.throws(() =>
    confirmSemantics(
      {
        ...financialMeaning,
        period: {
          kind: "interval",
          start: "2026-02-30",
          endExclusive: "2026-03-04",
        },
      },
      t,
      "owner",
      now,
    ),
  );
});

test("resource intervals respect mapped dates; undated changed snapshots retain meanings but require scope confirmation", () => {
  const t = table(
    ["Person", "Week", "Assigned", "Available"],
    ["text", "date", "number", "number"],
    [
      ["E1", "2026-10-04", 10, 40],
      ["E2", "2026-11-04", 40, 40],
    ],
  );
  const meaning = {
    purpose: "resources",
    entity: "resource",
    entityNamespace: "weekly",
    fields: {
      entity_id: "Person",
      date: "Week",
      assigned_hours: "Assigned",
      available_hours: "Available",
    },
    period: interval,
  };
  assert.equal(metric(run(t, meaning), "resources.utilization").value, 25);
  const undated = table(
    ["Person", "Assigned", "Available"],
    ["text", "number", "number"],
    [["E1", 10, 40]],
  );
  const sm = {
    ...meaning,
    fields: {
      entity_id: "Person",
      assigned_hours: "Assigned",
      available_hours: "Available",
    },
  };
  const semantic = confirmSemantics(sm, undated, "owner", now);
  undated.rows[0][1] = 20;
  const result = evaluateSemantics({
    companyId: "tenant-a",
    now,
    catalog: {
      sources: [
        {
          id: "a",
          tabs: [{ tabId: 1, table: undated, semantic, lastSuccess: now }],
        },
      ],
    },
  });
  assert.equal(metric(result, "resources.utilization").state, "provisional");
  assert.deepEqual(result.worksheets[0].confirmation.fields, sm.fields);
  assert.equal(result.worksheets[0].executiveEligible, false);
});
test("snapshot date context follows company timezone, and percentage fields cannot bind to amounts", () => {
  const t = table(["Project", "Status"], ["text", "text"], [["P1", "Doing"]]);
  const m = {
    purpose: "delivery",
    entity: "project",
    entityNamespace: "delivery",
    fields: { entity_id: "Project", status: "Status" },
    period: { kind: "snapshot", asOf: "2026-11-01" },
    statusValues: { active: ["Doing"] },
  };
  const time = Date.parse("2026-10-31T21:00:00Z"),
    semantic = confirmSemantics(m, t, "owner", time),
    catalog = {
      sources: [
        {
          id: "a",
          tabs: [{ tabId: 1, table: t, semantic, lastSuccess: time }],
        },
      ],
    };
  assert.equal(
    metric(
      evaluateSemantics({
        catalog,
        companyId: "tenant-a",
        now: time,
        timezone: "Asia/Karachi",
      }),
      "delivery.active_projects",
    ).value,
    1,
  );
  assert.equal(
    metric(
      evaluateSemantics({
        catalog,
        companyId: "tenant-a",
        now: time,
        timezone: "UTC",
      }),
      "delivery.active_projects",
    ).state,
    "provisional",
  );
  const f = finance();
  f.types[2] = "percentage";
  assert.throws(() => confirmSemantics(financialMeaning, f, "owner", now));
});

test("excluded reference data does not create business entity conflicts; unsafe numeric identifiers are blocked", () => {
  const t = finance(),
    semantic = confirmSemantics(financialMeaning, t, "owner", now),
    reference = confirmSemantics(
      { ...financialMeaning, purpose: "reference" },
      t,
      "owner",
      now,
    );
  const out = evaluateSemantics({
    companyId: "a",
    now,
    catalog: {
      sources: [
        {
          id: "a",
          tabs: [
            { tabId: 1, table: t, semantic, lastSuccess: now },
            { tabId: 2, table: t, semantic: reference, lastSuccess: now },
          ],
        },
      ],
    },
  });
  assert.equal(metric(out, "finance.revenue").state, "validated");
  assert.equal(out.worksheets[1].executiveEligible, false);
  const bad = finance();
  bad.types[0] = "number";
  bad.rows[0][0] = Number.MAX_SAFE_INTEGER + 1;
  bad.rows[1][0] = 42;
  assert.equal(
    metric(run(bad, financialMeaning), "finance.revenue").state,
    "provisional",
  );
});

test("original currency symbols and numeric identifier loss are observed before normalization", () => {
  const t = finance(),
    semantic = confirmSemantics(financialMeaning, t, "owner", now);
  const observation = currencyEvidence(
    [
      ["Entry", "Booked", "Turnover", "Spend"],
      ["T1", "2026-10-01", "€100", "€20"],
    ],
    0,
    semantic,
    t.headers,
    t,
  );
  assert.deepEqual(observation.currencies, ["EUR"]);
  const out = evaluateSemantics({
    companyId: "a",
    now,
    catalog: {
      sources: [
        {
          id: "a",
          tabs: [
            {
              tabId: 1,
              table: t,
              semantic: { ...semantic, observation },
              lastSuccess: now,
            },
          ],
        },
      ],
    },
  });
  assert.equal(metric(out, "finance.revenue").state, "provisional");
  t.types[0] = "number";
  t.rows[0][0] = 1;
  t.rows[1][0] = 2;
  const numeric = confirmSemantics(financialMeaning, t, "owner", now);
  const loss = currencyEvidence(
    [
      ["Entry", "Booked", "Turnover", "Spend"],
      ["0001", "2026-10-01", 100, 20],
    ],
    0,
    numeric,
    t.headers,
    t,
  );
  assert.equal(loss.identifierLoss, true);
});

test("exact supported multi-department mappings populate Overview without a second confirmation", () => {
  const tabs = [
    {
      tabId: "finance",
      title: "Finance - Ledger",
      department: "Finance",
      table: table(
        ["Entry ID", "Date", "Revenue", "Expenses", "Currency Code"],
        ["text", "date", "number", "number", "text"],
        [["F-1", "2026-10-01", 1000, 400, "USD"]],
      ),
    },
    {
      tabId: "sales",
      title: "Sales - Deals",
      department: "Sales",
      table: table(
        ["Deal ID", "Closed Date", "Amount", "Stage", "Currency Code"],
        ["text", "date", "number", "text", "text"],
        [
          ["D-1", "2026-10-02", 500, "Won", "USD"],
          ["D-2", "2026-10-03", 700, "Open", "USD"],
        ],
      ),
    },
    {
      tabId: "delivery",
      title: "Delivery - Projects",
      department: "Delivery",
      table: table(
        ["Project ID", "Status", "Due Date"],
        ["text", "text", "date"],
        [
          ["P-1", "In Progress", "2026-10-20"],
          ["P-2", "Completed", "2026-11-10"],
        ],
      ),
    },
    {
      tabId: "people",
      title: "People - Capacity",
      department: "People",
      table: table(
        ["Employee ID", "Reporting Date", "Assigned Hours", "Available Hours"],
        ["text", "date", "number", "number"],
        [
          ["E-1", "2026-10-01", 36, 40],
          ["E-2", "2026-10-01", 40, 40],
        ],
      ),
    },
    {
      tabId: "marketing",
      title: "Marketing - Campaigns",
      department: "Marketing",
      table: table(
        [
          "Campaign ID",
          "Start Date",
          "Spend",
          "Leads",
          "Qualified Leads",
          "Currency Code",
        ],
        ["text", "date", "number", "number", "number", "text"],
        [["M-1", "2026-10-01", 100, 20, 8, "USD"]],
      ),
    },
    {
      tabId: "operations",
      title: "Operations - Inventory",
      department: "Operations",
      table: table(
        ["SKU", "Snapshot Date", "On Hand", "Reorder Level"],
        ["text", "date", "number", "number"],
        [
          ["SKU-1", "2026-10-31", 5, 10],
          ["SKU-2", "2026-10-31", 20, 10],
        ],
      ),
    },
  ].map((tab) => ({ ...tab, lastSuccess: now }));
  const out = evaluateSemantics({
    companyId: "company",
    now,
    catalog: { revision: 3, sources: [{ id: "workbook", tabs }] },
  });
  assert.equal(metric(out, "finance.revenue").value, 1000);
  assert.equal(metric(out, "finance.profit").value, 600);
  assert.equal(metric(out, "sales.won_value").value, 500);
  assert.equal(metric(out, "sales.won_deals").value, 1);
  assert.equal(metric(out, "delivery.active_projects").value, 1);
  assert.equal(metric(out, "delivery.overdue_projects").value, 1);
  assert.equal(metric(out, "resources.utilization").value, 95);
  assert.equal(metric(out, "marketing.spend").value, 100);
  assert.equal(metric(out, "marketing.leads").value, 20);
  assert.equal(metric(out, "marketing.qualified_leads").value, 8);
  assert.equal(metric(out, "operations.on_hand").value, 25);
  assert.equal(metric(out, "operations.reorder_items").value, 1);
  assert.deepEqual(
    out.worksheets
      .filter((worksheet) => worksheet.executiveEligible)
      .map((w) => w.tabId),
    ["finance", "sales", "delivery", "people", "marketing", "operations"],
  );
  assert.ok(out.metrics.every((item) => item.lineage.snapshotRevision === 3));
});

test("automatic promotion refuses ambiguous identities, currencies and statuses", () => {
  const mixed = table(
    ["Deal ID", "Closed Date", "Amount", "Stage", "Currency Code"],
    ["text", "date", "number", "text", "text"],
    [
      ["D-1", "2026-10-01", 100, "Won", "USD"],
      ["D-1", "2026-10-02", 200, "Maybe", "EUR"],
    ],
  );
  const out = run(mixed);
  assert.ok(out.metrics.every((item) => item.state === "provisional"));
  assert.equal(out.worksheets[0].confirmation, null);
});
