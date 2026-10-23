import assert from "node:assert/strict";
import {
  buildSample,
  totals,
  inferProfile,
  availableMetrics,
  metricCovered,
  goalTarget,
  goalActual,
  preferenceKey,
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
