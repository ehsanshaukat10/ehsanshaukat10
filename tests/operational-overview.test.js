import { test } from "node:test";
import assert from "node:assert/strict";
import { operationalOverview } from "../aynor-onboarding-frontend/source/shared/operational-overview.mjs";
import {
  formatSyncTime,
  dateInTimezone,
} from "../aynor-onboarding-frontend/source/shared/sync-time.mjs";
test("non-financial business overview combines recorded statuses across departments and uses only mapped deadlines", () => {
  const tables = [
    {
      sourceId: "book",
      title: "Projects",
      department: "QA",
      headers: ["Ticket ID", "Status", "Target Date", "Effort hours"],
      types: ["text", "text", "date", "number"],
      rows: [
        ["0001", "Open", "2026-10-01", 1.5],
        ["0002", "Done", "2026-10-02", 2],
        ["0003", "Blocked", "2026-11-01", 0.5],
      ],
    },
    {
      sourceId: "book",
      department: "Sales",
      headers: ["Order code", "Stage", "Quantity"],
      types: ["text", "text", "number"],
      rows: [
        ["0001", "Paid", 5],
        ["0002", "Pending", 2],
        ["0003", "Cancelled", 1],
        ["0004", "Unfamiliar state", 3],
      ],
    },
  ];
  const result = operationalOverview(tables, "2026-10-30");
  assert.equal(result.workbooks, 1);
  assert.equal(result.pages, 2);
  assert.equal(result.records, 7);
  assert.equal(result.statusRecords, 7);
  assert.deepEqual(result.counts, {
    open: 2,
    completed: 2,
    flagged: 1,
    cancelled: 1,
    other: 1,
  });
  assert.equal(result.overdue, 1);
  assert.equal(result.measures.find((m) => m.name === "Quantity").total, 11);
  assert.equal(result.measures.find((m) => m.name === "Effort hours").total, 4);
  assert.equal(result.departments.find((d) => d.name === "QA").open, 1);
  assert.equal(result.departments.find((d) => d.name === "Sales").completed, 1);
  assert.equal(
    operationalOverview(
      [{ ...tables[0], types: ["text", "text", "text", "number"] }],
      "2026-10-30",
    ).overdue,
    null,
  );
});
test("operational summaries do not add identifiers, percentages, amounts or unknown numbers into financial KPIs", () => {
  const result = operationalOverview([
    {
      headers: ["ID", "Amount", "Rate", "Value", "Quantity"],
      types: ["number", "currency", "percentage", "number", "number"],
      rows: [
        [999, 200, 0.5, 800, 0.1],
        [1000, 500, 0.9, 900, 0.2],
      ],
    },
  ]);
  assert.equal(result.statusRecords, 0);
  assert.equal(result.overdue, null);
  assert.deepEqual(
    result.measures.map((m) => [m.name, m.total]),
    [["Quantity", 0.3]],
  );
  assert.equal(result.previewIndex, 0);
  assert.equal("revenue" in result, false);
  assert.equal("profit" in result, false);
});
test("sync timestamps include unambiguous date, seconds, AM/PM and the company timezone; deadline day follows that timezone", () => {
  const instant = Date.parse("2026-10-30T20:30:58Z");
  assert.match(
    formatSyncTime(instant, "Asia/Karachi"),
    /31 Oct 2026, 01:30:58 AM · Asia\/Karachi/,
  );
  assert.equal(dateInTimezone("Asia/Karachi", instant), "2026-10-31");
  assert.equal(dateInTimezone("UTC", instant), "2026-10-30");
  assert.equal(formatSyncTime(null, "UTC"), "Not synced yet");
  assert.equal(formatSyncTime("bad", "UTC"), "Timestamp unavailable");
  assert.match(formatSyncTime(instant, "invalid"), /UTC$/);
});
