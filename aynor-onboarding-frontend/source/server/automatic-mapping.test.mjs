import test from "node:test";
import assert from "node:assert/strict";
import { detectTable, mergeAiSuggestion } from "./automatic-mapping.mjs";
import { automaticallyConfirmSemantics } from "./semantic-intelligence.mjs";

const departments = ["Finance"];
const values = [
  ["Monthly management export", "", "", ""],
  ["Period", "Gross receipts", "Opex", "Currency"],
  ["2026-01-01", "1000", "400", "USD"],
  ["2026-02-01", "1200", "450", "USD"],
];

test("AI metadata mapping survives local validation and records provenance", () => {
  const base = detectTable(values, {
    title: "Monthly performance",
    tabId: 7,
    departments,
  });
  const prepared = mergeAiSuggestion(
    base,
    {
      tabId: 7,
      headerRow: base.headerRow,
      department: "Finance",
      properties: ["date", "money_in", "money_out", "text"],
    },
    values,
    departments,
  );
  assert.equal(prepared.config.origin, "ai");
  assert.deepEqual(prepared.config.properties, [
    "date",
    "money_in",
    "money_out",
    "text",
  ]);
  assert.equal(prepared.table.financial.totals.revenue, 2200);
  assert.equal(prepared.table.financial.totals.costs, 850);
});

test("unique finance reporting dates can provide deterministic row identity", () => {
  const base = detectTable(values, {
    title: "Monthly performance",
    tabId: 7,
    departments,
  });
  const prepared = mergeAiSuggestion(
    base,
    {
      tabId: 7,
      headerRow: base.headerRow,
      department: "Finance",
      properties: ["date", "money_in", "money_out", "text"],
    },
    values,
    departments,
  );
  const semantic = automaticallyConfirmSemantics(prepared.table, {
    sourceId: "source",
    tabId: 7,
    title: "Monthly performance",
    properties: prepared.config.properties,
    timezone: "UTC",
    now: Date.parse("2026-03-01T00:00:00Z"),
  });
  assert.equal(semantic?.purpose, "finance");
  assert.equal(semantic?.identityMode, "reporting_date");
  assert.equal(semantic?.fields.entity_id, "Period");
  assert.equal(semantic?.currency, "USD");
});

test("AI cannot bypass full-cell type validation", () => {
  const invalid = structuredClone(values);
  invalid[3][1] = "not a number";
  const base = detectTable(invalid, {
    title: "Monthly performance",
    tabId: 7,
    departments,
  });
  assert.throws(() =>
    mergeAiSuggestion(
      base,
      {
        tabId: 7,
        headerRow: base.headerRow,
        department: "Finance",
        properties: ["date", "money_in", "money_out", "text"],
      },
      invalid,
      departments,
    ),
  );
});
