import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assessGoal } from "../aynor-onboarding-frontend/source/server/goal-service.mjs";
import { goalInputSchema } from "../aynor-onboarding-frontend/source/server/goal-definition.mjs";
const period = {
  kind: "interval",
  start: "2026-10-01",
  endExclusive: "2026-11-01",
};
const base = {
  id: randomUUID(),
  version: 0,
  companyVersion: 1,
  title: "Improve performance",
  level: "department",
  department: "Finance",
  scope: "book:0",
  metricId: "finance.revenue",
  target: 500,
  unit: "currency",
  currency: "USD",
  period,
  deadline: "2026-11-15",
  owner: "",
  direction: "increase",
  threshold: "at_least",
  baseline: 100,
  lifecycle: "Active",
  binding: { entity: "transaction", namespace: "ledger" },
  protection: { department: "Finance" },
};
const metric = {
  scope: "book:0",
  unit: "currency",
  currency: "USD",
  period,
  state: "validated",
  value: 300,
};
const context = {
  binding: base.binding,
  department: "Finance",
  today: "2026-11-01",
};
test("increase progress uses an explicit baseline and retains actual, target and lifecycle distinctions", () => {
  const r = assessGoal(base, metric, context);
  assert.equal(r.actual, 300);
  assert.equal(r.progress, 50);
  assert.equal(r.met, false);
  assert.equal(r.assessment, "Below target");
  assert.ok(r.concern);
  assert.equal(r.deadlinePassed, false);
  assert.equal(
    assessGoal(base, { ...metric, value: 700 }, context).progress,
    150,
  );
  assert.equal(
    assessGoal(base, { ...metric, value: 0 }, context).progress,
    -25,
  );
  assert.equal(
    assessGoal({ ...base, baseline: null }, metric, context).progress,
    null,
  );
  assert.equal(
    assessGoal({ ...base, lifecycle: "Paused" }, metric, context).concern,
    null,
  );
});
test("reduce-to-zero goals calculate correctly without dividing by the target", () => {
  const g = { ...base, direction: "decrease", target: 0, baseline: 100 };
  assert.equal(assessGoal(g, { ...metric, value: 25 }, context).progress, 75);
  const zero = assessGoal(g, { ...metric, value: 0 }, context);
  assert.equal(zero.actual, 0);
  assert.equal(zero.progress, 100);
  assert.equal(zero.met, true);
  assert.equal(zero.assessment, "Target met");
});
test("threshold goals use the selected bound with no fabricated continuous progress", () => {
  const g = {
    ...base,
    direction: "maintain",
    baseline: null,
    target: 0,
    threshold: "at_most",
  };
  assert.equal(
    assessGoal(g, { ...metric, value: 0 }, context).assessment,
    "Within threshold",
  );
  assert.equal(assessGoal(g, { ...metric, value: 0 }, context).progress, null);
  assert.equal(
    assessGoal(g, { ...metric, value: 1 }, context).assessment,
    "Outside threshold",
  );
  assert.equal(
    assessGoal(
      { ...g, threshold: "at_least" },
      { ...metric, value: 1 },
      context,
    ).met,
    true,
  );
});
test("missing, stale, unconfirmed and incompatible scope/unit/currency/period data never creates actual or progress", () => {
  for (const value of [
    null,
    undefined,
    { ...metric, state: "stale" },
    { ...metric, state: "provisional" },
    { ...metric, value: null },
    { ...metric, scope: "other" },
    { ...metric, unit: "count" },
    { ...metric, currency: "EUR" },
    { ...metric, period: { ...period, endExclusive: "2026-12-01" } },
  ]) {
    const r = assessGoal(base, value, context);
    assert.equal(r.actual, null);
    assert.equal(r.progress, null);
    assert.equal(r.met, null);
    assert.equal(r.assessment, "Unassessed");
    assert.equal(r.concern, null);
    assert.ok(r.reason && r.next);
  }
  assert.equal(
    assessGoal(base, metric, {
      ...context,
      binding: { ...context.binding, namespace: "replacement" },
    }).available,
    false,
  );
  assert.equal(
    assessGoal(base, metric, { ...context, department: "Other" }).available,
    false,
  );
});
test("zero baselines, percentage-point change and historical deadlines are explicit and deterministic", () => {
  assert.equal(
    assessGoal({ ...base, baseline: 0, target: 500 }, metric, context).progress,
    60,
  );
  const r = assessGoal(
    { ...base, unit: "percent", currency: null, baseline: 60, target: 80 },
    { ...metric, unit: "percent", currency: null, value: 70 },
    context,
  );
  assert.equal(r.progress, 50);
  assert.match(r.concern.explanation, /10 percentage points/);
  assert.equal(
    assessGoal(base, undefined, { ...context, today: "2026-12-01" })
      .deadlinePassed,
    true,
  );
  assert.equal(
    assessGoal(base, undefined, { ...context, today: "2026-12-01" }).assessment,
    "Unassessed",
  );
  assert.equal(
    assessGoal(
      { ...base, baseline: -1e308, target: 1e308 },
      { ...metric, value: 0 },
      context,
    ).progress,
    null,
  );
});
test("goal contracts reject zero-distance changes, invalid dates and unsupported currencies while allowing legitimate zero targets", () => {
  const { binding, protection, ...input } = base;
  assert.equal(
    goalInputSchema.safeParse({ ...input, baseline: 500 }).success,
    false,
  );
  assert.equal(
    goalInputSchema.safeParse({
      ...input,
      direction: "decrease",
      baseline: 100,
      target: 0,
    }).success,
    true,
  );
  assert.equal(
    goalInputSchema.safeParse({
      ...input,
      direction: "maintain",
      baseline: null,
      target: 0,
    }).success,
    true,
  );
  assert.equal(
    goalInputSchema.safeParse({ ...input, deadline: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    goalInputSchema.safeParse({ ...input, currency: "ZZZ" }).success,
    false,
  );
  assert.equal(
    goalInputSchema.safeParse({
      ...input,
      unit: "count",
      currency: null,
      target: 0.5,
    }).success,
    false,
  );
  assert.equal(
    goalInputSchema.safeParse({
      ...input,
      period: {
        kind: "interval",
        start: "2026-11-01",
        endExclusive: "2026-10-01",
      },
    }).success,
    false,
  );
});

test("percentage goals retain financial currency context without treating percentage-point gaps as money", () => {
  const r = assessGoal(
    { ...base, unit: "percent", baseline: 0, target: 80 },
    { ...metric, unit: "percent", value: 70 },
    context,
  );
  assert.equal(r.actual, 70);
  assert.match(r.concern.explanation, /10 percentage points/);
  assert.equal(
    assessGoal(
      { ...base, unit: "percent", baseline: 0, target: 80 },
      { ...metric, unit: "percent", currency: "EUR", value: 70 },
      context,
    ).actual,
    null,
  );
});
