import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createIntelligenceService,
  reportingContext,
} from "../aynor-onboarding-frontend/source/server/intelligence-service.mjs";
import { confirmSemantics } from "../aynor-onboarding-frontend/source/server/semantic-intelligence.mjs";
const now = Date.parse("2026-11-01T12:00:00Z");
function fixture() {
  const table = {
    headers: ["ID", "Date", "Revenue", "Expenses"],
    types: ["text", "date", "currency", "currency"],
    rows: [["T1", "2026-10-01", 100, 20]],
  };
  const meaning = {
    purpose: "finance",
    entity: "transaction",
    entityNamespace: "shared-ledger",
    fields: {
      entity_id: "ID",
      date: "Date",
      revenue: "Revenue",
      expense: "Expenses",
    },
    currency: "USD",
    period: {
      kind: "interval",
      start: "2026-10-01",
      endExclusive: "2026-11-01",
    },
  };
  const tab = {
    tabId: 0,
    title: "Allowed",
    department: "Finance",
    table,
    lastSuccess: now,
    semantic: confirmSemantics(meaning, table, "owner", now),
  };
  return {
    membership: { user_id: "actor", role: "Executive", scope: [] },
    company: {
      id: "company",
      version: 1,
      profile: { timezone: "UTC" },
      data: {
        departments: ["Finance"],
        intelligenceAccess: {
          version: 1,
          worksheets: {
            "allowed:0": {
              category: "finance",
              sensitivity: "financial",
              recordColumns: ["ID", "Date", "Revenue"],
            },
          },
          grants: {
            "00000000-0000-4000-8000-000000000001": {
              categories: [],
              sensitivities: [],
            },
          },
        },
      },
    },
    snapshot: { revision: 1 },
    catalog: {
      sources: [{ id: "allowed", title: "Allowed source", tabs: [tab] }],
    },
  };
}
// Use valid actor UUID for the persistent policy contract.
function state() {
  const s = fixture();
  const actor = "00000000-0000-4000-8000-000000000001";
  s.membership.user_id = actor;
  s.company.data.intelligenceAccess.grants[actor] = {
    categories: ["finance"],
    sensitivities: ["financial"],
  };
  return { s, actor };
}
test("hidden overlapping entities remain globally invalidated without disclosing hidden source details", async () => {
  const { s, actor } = state();
  const hidden = structuredClone(s.catalog.sources[0]);
  hidden.id = "hidden";
  hidden.title = "Secret board payroll";
  hidden.tabs[0].title = "Confidential compensation";
  s.catalog.sources.push(hidden);
  const service = createIntelligenceService({
    read: async () => structuredClone(s),
    now: () => now,
  });
  const result = await service.snapshot("company", actor);
  assert.ok(
    result.metrics
      .filter((m) => m.state !== "unavailable")
      .every(
        (m) =>
          m.scope === "allowed:0" &&
          m.value === null &&
          m.state === "provisional",
      ),
  );
  assert.ok(!JSON.stringify(result).includes("Secret board"));
  assert.ok(!JSON.stringify(result).includes("Confidential compensation"));
  assert.ok(!JSON.stringify(result).includes("hidden:0"));
  assert.ok(
    result.metrics.every(
      (m) => m.reasons[0] === "This measure requires administrator review.",
    ),
  );
});
test("a fact and its rows are read once from one revision; a concurrent replacement cannot mix datasets", async () => {
  const { s, actor } = state();
  let current = s,
    reads = 0,
    replaceAfterRead = false;
  const service = createIntelligenceService({
    now: () => now,
    read: async () => {
      reads++;
      const selected = structuredClone(current);
      if (replaceAfterRead) {
        current = structuredClone(current);
        current.snapshot.revision++;
        current.catalog.sources[0].tabs[0].table.rows[0][2] = 900;
      }
      return selected;
    },
  });
  const report = await service.snapshot("company", actor);
  assert.equal(reads, 1);
  replaceAfterRead = true;
  reads = 0;
  const evidence = await service.evidence("company", actor, {
    sourceId: "allowed",
    tabId: 0,
    metricId: "finance.revenue",
    revision: report.datasetRevision,
  });
  assert.equal(reads, 1);
  assert.equal(evidence.metric.value, 100);
  assert.equal(evidence.rows[0][evidence.columns.indexOf("Revenue")], 100);
  await assert.rejects(
    () =>
      service.evidence("company", actor, {
        sourceId: "allowed",
        tabId: 0,
        metricId: "finance.revenue",
        revision: report.datasetRevision,
      }),
    (e) => e.status === 409,
  );
});
test("context is canonical, retains repeated filters and refuses unsupported or ambiguous scope selectors", () => {
  const a = reportingContext(
    new URLSearchParams("period=month&scope=a&tag=x&tag=y&department=Finance"),
  );
  const b = reportingContext(
    new URLSearchParams("department=Finance&tag=x&tag=y&scope=a&period=month"),
  );
  assert.equal(a.key, b.key);
  assert.deepEqual(a.filters.tag, ["x", "y"]);
  assert.throws(
    () => reportingContext(new URLSearchParams("scope=a&scope=b")),
    (e) => e.status === 400,
  );
  assert.throws(
    () => reportingContext({ role: "Admin" }),
    (e) => e.status === 400,
  );
});
test("a removed department and a mismatched company cannot restore scoped access", async () => {
  const { s, actor } = state();
  s.membership.role = "Viewer";
  s.membership.scope = ["Finance"];
  s.company.data.departments = [];
  const service = createIntelligenceService({
    read: async () => structuredClone(s),
    now: () => now,
  });
  assert.equal((await service.snapshot("company", actor)).metrics.length, 0);
  await assert.rejects(
    () => service.snapshot("another-company", actor),
    (e) => e.status === 403,
  );
});

test("every shared evaluation interface redacts non-approved source columns and sample values", async () => {
  const { s, actor } = state();
  const table = s.catalog.sources[0].tabs[0].table;
  table.headers.push("Private notes");
  table.types.push("text");
  table.rows[0].push("private acquisition plan");
  const service = createIntelligenceService({
    read: async () => structuredClone(s),
    now: () => now,
  });
  for (const view of [
    await service.evaluate("company", actor),
    await service.snapshot("company", actor),
  ]) {
    assert.ok(!JSON.stringify(view).includes("Private notes"));
    assert.ok(!JSON.stringify(view).includes("private acquisition plan"));
  }
  const context = await service.context("company", actor);
  const records = await service.records("company", actor, {
    scope: "allowed:0",
    revision: context.datasetRevision,
  });
  assert.ok(!JSON.stringify(records).includes("Private notes"));
});
