import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmSemantics,
  evaluateSemantics,
} from "../aynor-onboarding-frontend/source/server/semantic-intelligence.mjs";
import { buildExecutiveReport } from "../aynor-onboarding-frontend/source/server/executive-presentation.mjs";
const now = Date.parse("2026-11-01T12:00:00Z");
const period = {
  kind: "interval",
  start: "2026-10-01",
  endExclusive: "2026-11-01",
};
function fixture() {
  const finance = {
    headers: ["Date", "Revenue", "Expenses"],
    types: ["date", "currency", "currency"],
    rows: [
      ["2026-10-01", 12000, 4000],
      ["2026-10-15", 18000, 7000],
    ],
    title: "Ledger",
  };
  const delivery = {
    headers: ["Project ID", "State", "Due"],
    types: ["text", "text", "date"],
    rows: [
      ["P1", "Doing", "2026-10-10"],
      ["P2", "Done", "2026-10-10"],
    ],
    title: "Custom projects",
  };
  const fm = {
    label: "Recognized trading",
    purpose: "finance",
    entity: "transaction",
    entityNamespace: "finance",
    identityMode: "reporting_date",
    fields: {
      entity_id: "Date",
      date: "Date",
      revenue: "Revenue",
      expense: "Expenses",
    },
    currency: "USD",
    period,
  };
  const dm = {
    label: "Customer delivery",
    purpose: "delivery",
    entity: "project",
    entityNamespace: "projects",
    fields: { entity_id: "Project ID", status: "State", due_date: "Due" },
    statusValues: { active: ["Doing"], closed: ["Done"] },
    period: { kind: "snapshot", asOf: "2026-11-01" },
  };
  const catalog = {
    sources: [
      {
        id: "a",
        tabs: [
          {
            tabId: 0,
            department: "Finance",
            table: finance,
            lastSuccess: now,
            semantic: confirmSemantics(fm, finance, "owner", now),
          },
          {
            tabId: 1,
            department: "Delivery",
            table: delivery,
            lastSuccess: now,
            semantic: confirmSemantics(dm, delivery, "owner", now),
          },
        ],
      },
    ],
  };
  const view = evaluateSemantics({ catalog, companyId: "company", now });
  return { catalog, view, finance, fm, delivery };
}
test("executive presentation groups finance, verifies trend against source and keeps records off Overview", () => {
  const { catalog, view } = fixture();
  const report = buildExecutiveReport(
    view,
    { id: "company", data: { priorities: ["Profitability"] } },
    catalog,
  );
  assert.equal(report.selectedScope, "a:0");
  assert.deepEqual(
    report.primary.map((m) => m.metricId),
    ["finance.revenue", "finance.profit"],
  );
  assert.equal(report.primary[0].value, 30000);
  assert.equal(report.primary[1].value, 19000);
  assert.equal(
    report.performance.metrics.find((m) => m.metricId === "finance.margin")
      .value,
    63.3333333333333,
  );
  assert.deepEqual(report.performance.series, [
    { date: "2026-10-01", revenue: 12000, costs: 4000 },
    { date: "2026-10-15", revenue: 18000, costs: 7000 },
  ]);
  assert.equal(report.issues.length, 1);
  assert.match(
    report.issues[0].href,
    /overview\?scope=.*evidence=delivery.overdue_projects/,
  );
  assert.equal(report.issues[0].metric.value, 1);
  assert.equal(JSON.stringify(report).includes("worksheet pages"), false);
});
test("company priorities, configured metrics, business model and selected scopes govern content without combining tables", () => {
  const { catalog, view } = fixture();
  assert.equal(
    buildExecutiveReport(
      view,
      { id: "company", businessModel: "Professional services", data: {} },
      catalog,
    ).selectedScope,
    "a:1",
  );
  assert.equal(
    buildExecutiveReport(
      view,
      { id: "company", data: { priorities: ["Project delivery"] } },
      catalog,
    ).selectedScope,
    "a:1",
  );
  assert.equal(
    buildExecutiveReport(
      view,
      {
        id: "company",
        data: {
          priorities: ["Project delivery"],
          kpis: [{ enabled: true, name: "Revenue" }],
        },
      },
      catalog,
    ).selectedScope,
    "a:0",
  );
  const r = buildExecutiveReport(
    view,
    { id: "company", data: { priorities: ["Profitability"] } },
    catalog,
    "a:1",
  );
  assert.equal(r.performance.kind, "delivery");
  assert.equal(r.primary[0].value, 1);
  assert.equal(r.additional[0].metrics[0].currency, "USD");
  assert.equal(
    r.primary.some((m) => m.metricId === "finance.revenue"),
    false,
  );
});
test("no unconfirmed, stale or unrelated spreadsheet total is promoted; null never becomes zero", () => {
  const { catalog } = fixture();
  delete catalog.sources[0].tabs[0].semantic;
  catalog.sources[0].tabs[1].error = "Refresh failed";
  const view = evaluateSemantics({ catalog, companyId: "company", now });
  const r = buildExecutiveReport(view, { id: "company", data: {} }, catalog);
  assert.equal(r.primary.length, 0);
  assert.equal(r.issues.length, 0);
  assert.equal(r.performance, null);
  assert.equal(r.dataStatus, "Data needs refresh");
  assert.equal(r.state, "review");
});
test("date-as-identity is explicit and duplicate financial dates are never summed into confirmed performance", () => {
  const { finance, fm, catalog } = fixture();
  assert.throws(() =>
    confirmSemantics(
      { ...fm, identityMode: "identifier" },
      finance,
      "owner",
      now,
    ),
  );
  finance.rows.push(["2026-10-01", 400, 100]);
  catalog.sources[0].tabs[0].semantic = confirmSemantics(
    fm,
    finance,
    "owner",
    now,
  );
  const view = evaluateSemantics({ catalog, companyId: "company", now });
  assert.ok(
    view.metrics
      .filter((m) => m.scope === "a:0")
      .every((m) => m.value === null),
  );
});

test("a company configured for margin alone still gets its validated percentage, never an empty confirmation loop", () => {
  const { catalog } = fixture();
  const view = evaluateSemantics({
    catalog,
    companyId: "company",
    now,
    settings: { enabledMetrics: ["finance.margin"] },
  });
  const report = buildExecutiveReport(
    view,
    {
      id: "company",
      data: { kpis: [{ enabled: true, name: "Operating margin" }] },
    },
    catalog,
  );
  assert.equal(report.primary.length, 1);
  assert.equal(report.primary[0].metricId, "finance.margin");
  assert.equal(report.primary[0].unit, "percent");
  assert.equal(report.performance, null);
});

test("an explicitly configured profit metric with missing expense inputs shows a concise correction state", () => {
  const { catalog, finance, fm } = fixture();
  delete fm.fields.expense;
  catalog.sources[0].tabs[0].semantic = confirmSemantics(
    fm,
    finance,
    "owner",
    now,
  );
  const view = evaluateSemantics({ catalog, companyId: "company", now });
  const report = buildExecutiveReport(
    view,
    {
      id: "company",
      data: { kpis: [{ name: "Operating profit", enabled: true }] },
    },
    catalog,
    "a:0",
  );
  assert.equal(report.dataStatus, "Insufficient data");
  assert.equal(
    report.primary.some((m) => m.metricId === "finance.profit"),
    false,
  );
  assert.match(report.reviewHref, /source=a&tab=0/);
});

test("deliberately excluded reporting is retained without a false mapping warning", () => {
  const { catalog } = fixture();
  for (const tab of catalog.sources[0].tabs) tab.semantic.enabled = false;
  const view = evaluateSemantics({ catalog, companyId: "company", now });
  const r = buildExecutiveReport(view, { id: "company", data: {} }, catalog);
  assert.equal(r.state, "not_selected");
  assert.equal(r.primary.length, 0);
  assert.equal(r.dataStatus, null);
});
