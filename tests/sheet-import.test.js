import { test } from "node:test";
import assert from "node:assert/strict";
import {
  columns,
  validateRows,
} from "../aynor-onboarding-frontend/source/server/sheets-validation.mjs";
test("blank and repeated headers keep positional mappings and financial totals", () => {
  const rows = [
    ["Date", "", "Revenue", "Revenue", "Costs"],
    ["2026/9/1", "note", "$1,200.50", "50", "(£200.25)"],
  ];
  assert.deepEqual(columns(rows), [
    "Date",
    "Column 2",
    "Revenue",
    "Revenue (2)",
    "Costs",
  ]);
  const data = validateRows(rows, {
    date: "Date",
    revenue: "Revenue",
    expenses: "Costs",
  });
  assert.deepEqual(data.points, [
    { date: "2026-09-01", revenue: 1200.5, costs: -200.25 },
  ]);
  assert.equal(
    validateRows(rows, {
      date: "Date",
      revenue: "Revenue (2)",
      expenses: "Costs",
    }).points[0].revenue,
    50,
  );
});
test("normalization avoids name collisions and does not fabricate invalid records", () => {
  assert.deepEqual(columns([["", "Column 1", "Revenue", "revenue"]]), [
    "Column 1",
    "Column 1 (2)",
    "Revenue",
    "revenue (2)",
  ]);
  for (const row of [
    ["2026-02-30", "10", "2"],
    ["01/02/2026", "10", "2"],
    ["2026-09-01", "unknown", "2"],
  ]) {
    assert.throws(() =>
      validateRows([["Date", "Revenue", "Costs"], row], {
        date: "Date",
        revenue: "Revenue",
        expenses: "Costs",
      }),
    );
  }
});
