import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { projectGoals } from "../aynor-onboarding-frontend/source/server/goal-service.mjs";
const goal = {
  id: randomUUID(),
  name: "Improve profitability",
  target: "20% growth",
  owner: "Momina Liaqat",
  kpi: "Profitability",
  description: "Preserve the intended outcome.",
  deadline: "2026-12-31",
};
function state(admin = true) {
  return {
    timezone: "Asia/Karachi",
    companyVersion: 1,
    companyData: { goals: [goal], governedGoals: [] },
    policy: { admin, scopes: new Map(), canReadProtectedFact: () => admin },
    report: {
      companyId: randomUUID(),
      metrics: [],
      authorization: {},
      datasetRevision: "r1",
      context: { key: "k", scope: "", department: "" },
    },
  };
}
test("saved descriptive goals remain visible without invented metric values or ownership changes", () => {
  const s = state();
  const v = projectGoals(s);
  assert.deepEqual(v.onboarding, [goal]);
  assert.deepEqual(v.items, []);
  assert.ok(!JSON.stringify(v.onboarding).includes("progress"));
});
test("unbound company definitions do not leak to restricted roles or masquerade as scoped goals", () => {
  assert.deepEqual(projectGoals(state(false)).onboarding, []);
  for (const context of [{ scope: "book:0" }, { department: "Finance" }]) {
    const s = state();
    Object.assign(s.report.context, context);
    assert.deepEqual(projectGoals(s).onboarding, []);
  }
});
test("titles are not identifiers; distinct goals with the same title are preserved", () => {
  const s = state();
  s.companyData.goals.push({ ...goal, id: randomUUID() });
  assert.equal(projectGoals(s).onboarding.length, 2);
});
test("a previously confirmed ID is rendered once without mutating or merging conflicting stored definitions", () => {
  const s = state();
  s.companyData.governedGoals = [
    {
      id: goal.id,
      title: "Confirmed revenue target",
      description: "Explicit confirmed definition",
      version: 1,
      level: "company",
      department: "",
      scope: "book:0",
      metricId: "finance.revenue",
      target: 500,
      unit: "currency",
      currency: "USD",
      period: {
        kind: "interval",
        start: "2026-10-01",
        endExclusive: "2026-11-01",
      },
      deadline: goal.deadline,
      owner: goal.owner,
      direction: "increase",
      threshold: "at_least",
      baseline: 100,
      lifecycle: "Active",
      binding: { entity: "transaction", namespace: "ledger" },
      protection: {
        scope: "book:0",
        department: "Finance",
        category: "finance",
        sensitivities: ["financial"],
      },
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  const before = JSON.stringify(s.companyData),
    v = projectGoals(s);
  assert.equal(v.items.length, 1);
  assert.equal(v.items[0].title, "Confirmed revenue target");
  assert.deepEqual(v.onboarding, []);
  assert.equal(JSON.stringify(s.companyData), before);
});
