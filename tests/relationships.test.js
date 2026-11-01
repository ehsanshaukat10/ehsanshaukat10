import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createIntelligenceService } from "../aynor-onboarding-frontend/source/server/intelligence-service.mjs";
import {
  confirmSemantics,
  schemaOf,
} from "../aynor-onboarding-frontend/source/server/semantic-intelligence.mjs";
import { relationshipContractsSchema } from "../aynor-onboarding-frontend/source/server/relationship-intelligence.mjs";
const now = Date.parse("2026-11-01T12:00:00Z"),
  actor = randomUUID(),
  company = randomUUID();
function fixture() {
  const source = randomUUID(),
    period = { kind: "snapshot", asOf: "2026-11-01" };
  const table = (headers, types, rows) => ({ headers, types, rows });
  const tables = [
    table(
      ["Project ID", "Project", "Resource ID", "Status", "Due"],
      ["text", "text", "text", "text", "date"],
      [
        ["P1", "Portal", "R1", "Doing", "2026-10-01"],
        ["P2", "Billing", "R1", "Doing", "2026-10-02"],
        ["P3", "Unassigned", null, "Done", "2026-10-01"],
        ["P4", "Unresolved", "R404", "Doing", "2026-10-02"],
      ],
    ),
    table(
      ["Resource ID", "Name", "Assigned", "Available"],
      ["text", "text", "number", "number"],
      [
        ["R1", "Sara", 20, 40],
        ["R2", "Same name", 20, 40],
      ],
    ),
  ];
  const mappings = [
    {
      purpose: "delivery",
      entity: "project",
      fields: {
        entity_id: "Project ID",
        project_name: "Project",
        status: "Status",
        due_date: "Due",
      },
      statusValues: { active: ["Doing"], closed: ["Done"] },
    },
    {
      purpose: "resources",
      entity: "resource",
      fields: {
        entity_id: "Resource ID",
        resource_name: "Name",
        assigned_hours: "Assigned",
        available_hours: "Available",
      },
    },
  ];
  const tabs = tables.map((t, i) => ({
    tabId: i,
    title: ["Projects", "People"][i],
    department: ["Studio", "People"][i],
    lastSuccess: now,
    table: t,
    semantic: confirmSemantics(
      { ...mappings[i], entityNamespace: "ns-" + i, period },
      t,
      actor,
      now,
    ),
  }));
  const contract = {
    id: randomUUID(),
    label: "Project resourcing",
    from: {
      scope: source + ":0",
      entity: "project",
      idColumn: "Project ID",
      labelColumn: "Project",
      namespace: "ns-0",
      schema: schemaOf(tables[0]),
    },
    to: {
      scope: source + ":1",
      entity: "resource",
      idColumn: "Resource ID",
      labelColumn: "Name",
      namespace: "ns-1",
      schema: schemaOf(tables[1]),
    },
    foreignKey: "Resource ID",
    confirmed: true,
  };
  const state = {
    membership: { user_id: actor, role: "Owner", scope: [] },
    company: {
      id: company,
      version: 1,
      profile: { timezone: "Asia/Karachi" },
      data: {
        departments: ["Studio", "People"],
        relationshipContracts: [contract],
        intelligenceAccess: {
          version: 1,
          worksheets: {
            [source + ":0"]: {
              category: "delivery",
              sensitivity: "standard",
              recordColumns: tables[0].headers,
            },
            [source + ":1"]: {
              category: "resources",
              sensitivity: "confidential",
              recordColumns: tables[1].headers,
            },
          },
          grants: {
            [actor]: {
              categories: ["delivery", "resources"],
              sensitivities: ["confidential"],
            },
          },
        },
      },
    },
    catalog: { sources: [{ id: source, title: "Operations", tabs }] },
    snapshot: { revision: 1 },
    connection: { revision: 1 },
  };
  const service = createIntelligenceService({
    read: async (c, a) => (c === company && a === actor ? state : null),
    now: () => now,
  });
  return {
    state,
    service,
    tabs,
    contract,
    reconfirm: () =>
      tabs.forEach((t, i) => {
        t.semantic = confirmSemantics(
          { ...mappings[i], entityNamespace: "ns-" + i, period },
          t.table,
          actor,
          now,
        );
      }),
  };
}
test("confirmed ID references produce deterministic relationships, shared-resource facts and revision-bound evidence, without changing metrics", async () => {
  const f = fixture(),
    before = await f.service.snapshot(company, actor, {}),
    result = await f.service.relationships(company, actor, {
      period: "month",
      tag: ["a", "b"],
    });
  assert.equal(result.relationships.length, 2);
  assert.equal(result.scopes.length, 2);
  assert.equal(result.concerns.length, 1);
  assert.equal(result.concerns[0].projectCount, 2);
  assert.match(result.concerns[0].explanation, /does not establish/);
  assert.equal(result.diagnostics[0].missingReferences, 1);
  assert.equal(result.diagnostics[0].unresolvedReferences, 1);
  assert.equal(result.state, "partial");
  assert.deepEqual(
    (await f.service.snapshot(company, actor, {})).metrics,
    before.metrics,
  );
  assert.deepEqual(result.context.filters.tag, ["a", "b"]);
  const relation = result.relationships[0];
  assert.equal(relation.to.label, "Sara");
  const evidence = await f.service.relationshipEvidence(company, actor, {
    relationshipId: relation.id,
    revision: result.datasetRevision,
    department: "Studio",
  });
  assert.equal(evidence.sources.length, 2);
  assert.deepEqual(evidence.sources[0].rows, [["P1", "R1", "Portal"]]);
  assert.equal(evidence.sources[1].rows[0][0], "R1");
  assert.equal(
    (await f.service.relationships(company, actor, {})).relationships[0].id,
    relation.id,
  );
  f.state.snapshot.revision++;
  await assert.rejects(
    () =>
      f.service.relationshipEvidence(company, actor, {
        relationshipId: relation.id,
        revision: result.datasetRevision,
      }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => f.service.relationships(randomUUID(), actor, {}),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () =>
      f.service.relationshipEvidence(company, randomUUID(), {
        relationshipId: relation.id,
        revision: result.datasetRevision,
      }),
    (e) => e.status === 403,
  );
});
test("missing and duplicate identifiers, unresolved IDs and similarly named entities never fabricate joins", async () => {
  const f = fixture();
  f.tabs[1].table.rows.push(["R1", "Duplicate", 1, 1], [null, "Missing", 1, 1]);
  f.reconfirm();
  let r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.equal(r.concerns.length, 0);
  assert.equal(r.diagnostics[0].duplicateIdentifiers, 2);
  assert.equal(r.diagnostics[0].missingIdentifiers, 1);
  f.tabs[1].table.rows.splice(2);
  f.tabs[0].table.rows[0][2] = "Sara";
  f.tabs[0].table.rows[1][2] = "r1";
  f.reconfirm();
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.equal(r.diagnostics[0].unresolvedReferences, 3);
  f.tabs[0].table.rows[0][2] = "R1";
  f.tabs[0].table.rows[1][0] = "P1";
  f.reconfirm();
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.equal(r.diagnostics[0].duplicateIdentifiers, 2);
});
test("unauthorized endpoints and join fields cannot leak through labels, diagnostics, concern counts or evidence", async () => {
  const f = fixture(),
    original = await f.service.relationships(company, actor, {}),
    id = original.relationships[0].id;
  f.state.membership = {
    user_id: actor,
    role: "Department Manager",
    scope: ["Studio"],
  };
  let r = await f.service.relationships(company, actor, {});
  assert.deepEqual(r.relationships, []);
  assert.deepEqual(r.concerns, []);
  assert.deepEqual(r.scopes, []);
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.configuration, undefined);
  assert.ok(!JSON.stringify(r).includes("Sara"));
  await assert.rejects(
    () =>
      f.service.relationshipEvidence(company, actor, {
        relationshipId: id,
        revision: r.datasetRevision,
      }),
    (e) => e.status === 404,
  );
  f.state.membership.scope.push("People");
  f.state.company.data.intelligenceAccess.grants[actor].sensitivities = [];
  r = await f.service.relationships(company, actor, {});
  assert.deepEqual(r.relationships, []);
  f.state.company.data.intelligenceAccess.grants[actor].sensitivities = [
    "confidential",
  ];
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 2);
  f.state.company.data.intelligenceAccess.worksheets[
    f.contract.to.scope
  ].recordColumns = ["Resource ID"];
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships[0].to.label, null);
  assert.ok(!JSON.stringify(r).includes("Sara"));
  f.state.company.data.intelligenceAccess.worksheets[
    f.contract.from.scope
  ].recordColumns = ["Project ID"];
  r = await f.service.relationships(company, actor, {});
  assert.deepEqual(r.relationships, []);
  assert.deepEqual(r.diagnostics, []);
});
test("incompatible periods, changed unconfirmed rows, stale data and schema changes stop relationship calculation", async () => {
  const f = fixture();
  f.tabs[1].semantic.period = { kind: "snapshot", asOf: "2026-10-31" };
  let r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  f.reconfirm();
  f.tabs[0].table.rows[0][2] = "R2";
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.match(r.diagnostics[0].reason, /reconfirm/);
  f.reconfirm();
  f.tabs[1].lastSuccess = now - 49 * 3600000;
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.match(r.diagnostics[0].reason, /Refresh/);
  f.tabs[1].lastSuccess = now;
  f.contract.from.schema = "old";
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.equal(
    relationshipContractsSchema.safeParse([{ ...f.contract, confirmed: false }])
      .success,
    false,
  );
});

test("namespaces and exact typed identifiers remain explicit across syncs", async () => {
  const f = fixture();
  f.tabs[1].semantic.entityNamespace = "replacement-register";
  let r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  f.reconfirm();
  f.tabs[0].table.types[2] = "number";
  f.tabs[0].table.rows[0][2] = 1;
  f.tabs[0].table.rows[1][2] = 1;
  f.tabs[0].table.rows[3][2] = 404;
  f.tabs[1].table.types[0] = "number";
  f.tabs[1].table.rows[0][0] = 1;
  f.tabs[1].table.rows[1][0] = 2;
  f.state.catalog.sources[0].workbook = f.tabs.map((t) => ({
    tabId: t.tabId,
    values: [t.table.headers, ...t.table.rows.map((r) => [...r])],
  }));
  f.reconfirm();
  f.contract.from.schema = schemaOf(f.tabs[0].table);
  f.contract.to.schema = schemaOf(f.tabs[1].table);
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 2);
  f.tabs[0].config = { headerRow: 0, endRow: 5 };
  f.state.catalog.sources[0].workbook[0].values.push([
    "Footer",
    "Outside confirmed range",
    "0001",
  ]);
  assert.equal(
    (await f.service.relationships(company, actor, {})).relationships.length,
    2,
    "Ignored footer cells cannot invalidate an in-range ID match",
  );
  f.state.catalog.sources[0].workbook[0].values[1][2] = "001";
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.match(r.diagnostics[0].reason, /formatting/);
  f.state.catalog.sources[0].workbook[0].values[1][2] = 1;
  f.tabs[1].table.types[0] = "text";
  f.tabs[1].table.rows[0][0] = "1";
  f.tabs[1].table.rows[1][0] = "2";
  f.reconfirm();
  f.contract.to.schema = schemaOf(f.tabs[1].table);
  r = await f.service.relationships(company, actor, {});
  assert.equal(
    r.relationships.length,
    0,
    "Numeric 1 does not become textual 1",
  );
});

test("a second workbook structure supports invoice-to-client references only after explicit client mapping", async () => {
  const f = fixture(),
    period = { kind: "snapshot", asOf: "2026-11-01" };
  const source = f.state.catalog.sources[0];
  f.tabs[0].table = {
    headers: ["Invoice", "Client ref", "Balance", "State", "Deadline"],
    types: ["text", "text", "number", "text", "date"],
    rows: [["INV-A", "C1", 50, "Open", "2026-10-01"]],
  };
  f.tabs[1].table = {
    headers: ["Client key", "Legal name"],
    types: ["text", "text"],
    rows: [["C1", "Acme"]],
  };
  f.tabs[0].semantic = confirmSemantics(
    {
      purpose: "finance",
      entity: "invoice",
      entityNamespace: "invoice-register",
      fields: {
        entity_id: "Invoice",
        status: "State",
        outstanding_amount: "Balance",
        due_date: "Deadline",
      },
      currency: "USD",
      period,
    },
    f.tabs[0].table,
    actor,
    now,
  );
  f.tabs[1].semantic = confirmSemantics(
    {
      purpose: "other",
      entity: "other",
      entityNamespace: "client-register",
      fields: { entity_id: "Client key", client_name: "Legal name" },
      period,
    },
    f.tabs[1].table,
    actor,
    now,
  );
  Object.assign(f.contract, {
    label: "Invoice billed to client",
    foreignKey: "Client ref",
    from: {
      scope: source.id + ":0",
      entity: "invoice",
      idColumn: "Invoice",
      labelColumn: "",
      namespace: "invoice-register",
      schema: schemaOf(f.tabs[0].table),
    },
    to: {
      scope: source.id + ":1",
      entity: "client",
      idColumn: "Client key",
      labelColumn: "Legal name",
      namespace: "client-register",
      schema: schemaOf(f.tabs[1].table),
    },
  });
  const r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 1);
  assert.equal(r.relationships[0].to.label, "Acme");
  assert.equal(r.concerns.length, 0);
  f.contract.confirmed = false;
  assert.equal(
    (await f.service.relationships(company, actor, {})).relationships.length,
    0,
  );
});

test("conflicting target definitions fail closed with role-appropriate diagnostics", async () => {
  const f = fixture();
  f.state.company.data.relationshipContracts.push({
    ...structuredClone(f.contract),
    id: randomUUID(),
    to: { ...f.contract.to, entity: "employee" },
  });
  let r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.equal(r.concerns.length, 0);
  assert.match(r.diagnostics[0].reason, /conflicting/);
  f.state.membership.role = "Executive";
  r = await f.service.relationships(company, actor, {});
  assert.equal(r.relationships.length, 0);
  assert.ok(
    r.diagnostics.every(
      (d) =>
        d.reason === "This relationship mapping requires administrator review.",
    ),
  );
});
