import assert from "node:assert/strict";
import {
  overviewExampleCompany,
  usesExampleData,
  buildSample,
  totals,
  inferProfile,
  availableMetrics,
  metricCovered,
  goalTarget,
  goalActual,
  preferenceKey,
  readPreferences,
} from "../features/dashboard/model.ts";
const c = {
  id: "test",
  name: "Test",
  role: "Owner",
  scope: [],
  industry: "Professional services",
  businessModel: "B2B",
  currency: "USD",
  data: {
    departments: ["Finance", "Sales", "Project Delivery"],
    priorities: ["Revenue growth"],
    goals: [],
    sources: [],
  },
};
const now = new Date("2026-10-23T12:00:00Z");
assert.equal(inferProfile(c), "services");
assert.equal(inferProfile({ ...c, industry: "SaaS subscriptions" }), "saas");
assert.equal(inferProfile({ ...c, industry: "Managed IT support" }), "managed");
const month = buildSample(c, "services", "30d", "connected", now),
  quarter = buildSample(c, "services", "quarter", "connected", now),
  year = buildSample(c, "services", "year", "connected", now);
assert.equal(month.points.length, 4);
assert.equal(quarter.points.length, 3);
assert.equal(year.points.length, 12);
assert.equal(totals(month).revenue, year.points.at(-1).revenue);
assert.equal(totals(month).costs, year.points.at(-1).costs);
assert.equal(
  totals(quarter).revenue,
  year.points.slice(-3).reduce((s, p) => s + p.revenue, 0),
);
assert.equal(
  quarter.previousRevenue,
  year.points.slice(-6, -3).reduce((s, p) => s + p.revenue, 0),
);
assert.equal(quarter.points[0].date, "2026-07-01");
assert.equal(quarter.points.at(-1).date, "2026-09-01");
assert.equal(
  totals(quarter).margin,
  ((totals(quarter).revenue - totals(quarter).costs) /
    totals(quarter).revenue) *
    100,
);
const partial = buildSample(
  { ...c, data: { ...c.data, departments: ["Marketing", "Finance", "Legal"] } },
  "services",
  "quarter",
  "partial",
  now,
);
assert.equal(metricCovered("margin", partial), false);
assert.ok(partial.risks.every((r) => partial.covered.includes(r.department)));
const clear = buildSample(c, "services", "quarter", "clear", now);
assert.equal(clear.risks.length, 0);
assert.ok(
  clear.projects.every((p) => p.status === "On track" && p.due >= "2026-10-23"),
);
assert.equal(
  buildSample(c, "services", "quarter", "stale", now)
    .asOf.toISOString()
    .slice(0, 10),
  "2026-10-11",
);
const viewer = {
  ...c,
  role: "Viewer",
  scope: ["Project Delivery"],
  data: { ...c.data, departments: ["Project Delivery"] },
};
assert.ok(
  !availableMetrics("saas", viewer).some((m) =>
    ["margin", "receivables", "churn", "retention"].includes(m),
  ),
);
assert.equal(
  goalActual({ name: "Improve morale", kpi: "Survey", target: "80" }, quarter),
  null,
);
assert.equal(goalTarget("1.2m"), 1200000);
assert.equal(goalTarget("500,000"), 500000);
assert.equal(goalTarget(""), null);
assert.notEqual(preferenceKey("a", c), preferenceKey("b", c));
assert.notEqual(
  preferenceKey("a", c),
  preferenceKey("a", { ...c, id: "other" }),
);
console.log(
  "PASS dashboard model: period arithmetic, source coverage, profiles, permissions, missing measures and preference isolation",
);

const sparse = {
  ...c,
  data: { ...c.data, departments: ["Finance"], goals: [] },
};
const original = JSON.stringify(sparse),
  example = overviewExampleCompany(sparse);
assert.equal(JSON.stringify(sparse), original);
assert.equal(example.data.departments.length, 1);
assert.equal(example.data.goals.length, 0);
assert.equal(
  availableMetrics(inferProfile(example), example).slice(0, 3).length,
  2,
);
assert.equal(overviewExampleCompany(viewer), viewer);
console.log(
  "PASS sparse workspaces do not invent departments, goals or out-of-scope metrics",
);

const legacy = {
  period: "year",
  currency: "GBP",
  profile: "services",
  sections: ["departments", "goals", "clients", "activity"],
  metrics: ["margin"],
  order: ["goals", "departments"],
};
globalThis.localStorage = { getItem: () => JSON.stringify(legacy) };
const migrated = readPreferences("legacy", c);
assert.equal(migrated.period, "year");
assert.equal(migrated.currency, "GBP");
assert.deepEqual(migrated.sections, ["departments", "goals"]);
assert.equal(migrated.order[0], "goals");
legacy.layoutRevision = 2;
assert.ok(readPreferences("current", c).sections.includes("activity"));
console.log(
  "PASS layout migration removes legacy default noise and preserves explicit current preferences",
);

const demoReady = {
  ...c,
  data: {
    ...c.data,
    demo: true,
    connected: true,
    sources: ["Example workbook"],
    mappings: [{ confirmed: true, ignored: false }],
    steps: {
      integrations: "completed",
      mapping: "completed",
      goals: "skipped",
    },
  },
};
assert.equal(usesExampleData(demoReady), true);
assert.equal(
  usesExampleData({ ...demoReady, data: { ...demoReady.data, sources: [] } }),
  false,
);
assert.equal(
  usesExampleData({
    ...demoReady,
    data: {
      ...demoReady.data,
      steps: { ...demoReady.data.steps, mapping: "skipped" },
    },
  }),
  false,
);
assert.equal(
  usesExampleData({ ...demoReady, data: { ...demoReady.data, demo: false } }),
  false,
);
console.log(
  "PASS missing data never becomes example metrics and optional skipped setup preserves configured example data",
);
