import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
import { evaluateSemantics } from "../aynor-onboarding-frontend/source/server/semantic-intelligence.mjs";
import { buildExecutiveReport } from "../aynor-onboarding-frontend/source/server/executive-presentation.mjs";
test("shared intelligence preserves exact metrics and enforces categories, confidentiality, scopes, revisions and record projection", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "intelligence@example.test",
    INITIAL_OWNER_PASSWORD: "intelligence-owner-password-long",
  };
  const app = createApplication({ env, fetchImpl: f.fetchImpl });
  let cookie = "";
  async function call(path, method = "GET", body) {
    let status, data, headers;
    await app(
      {
        url: "/api" + path,
        method,
        body,
        headers: { host: "aynor.example", cookie },
        socket: {},
      },
      {
        writeHead(s, h) {
          status = s;
          headers = h;
          if (h["Set-Cookie"]) cookie = h["Set-Cookie"].split(";")[0];
        },
        end(raw) {
          data = raw ? JSON.parse(raw) : null;
        },
      },
    );
    return { status, data, headers };
  }
  assert.equal(
    (
      await call("/auth/login", "POST", {
        email: env.INITIAL_OWNER_EMAIL,
        password: env.INITIAL_OWNER_PASSWORD,
      })
    ).status,
    200,
  );
  const ownerCookie = cookie;
  const c = (
    await call("/companies", "POST", {
      name: "Governed",
      industry: "Services",
      country: "PK",
      currency: "USD",
      timezone: "Asia/Karachi",
    })
  ).data;
  const other = (
    await call("/companies", "POST", {
      name: "Other",
      industry: "Services",
      country: "PK",
      currency: "USD",
      timezone: "Asia/Karachi",
    })
  ).data;
  const root = `/companies/${c.id}/sources`,
    api = `/companies/${c.id}/intelligence`;
  const rewrittenContext = await call(
    `/handler.js?route=${api.slice(1)}/context&scope=`,
  );
  assert.equal(rewrittenContext.status, 200);
  assert.equal(rewrittenContext.data.companyId, c.id);
  const upload = await call(root, "POST", {
    mode: "upload",
    name: "Mixed.xlsx",
    sheets: [
      {
        name: "Operating ledger",
        rows: [
          [
            "Transaction ID",
            "Date",
            "Revenue",
            "Expenses",
            "Client",
            "Secret salary",
          ],
          ["T1", "2026-10-01", 100, 20, "Acme", 999999],
          ["T2", "2026-10-02", 200, 30, "Nimbus", 888888],
        ],
      },
      {
        name: "Projects",
        rows: [
          ["Project ID", "Status", "Due date"],
          ["P1", "Doing", "2026-10-01"],
        ],
      },
      {
        name: "Payroll",
        rows: [
          ["Employee ID", "Assigned hours", "Available hours"],
          ["E1", 45, 40],
        ],
      },
    ],
  });
  assert.equal(upload.status, 200);
  const id = upload.data.selectedId;
  await call(root + `/${id}/prepare`, "POST", { allowAi: false });
  const asOf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const meanings = [
    {
      purpose: "finance",
      entity: "transaction",
      fields: {
        entity_id: "Transaction ID",
        date: "Date",
        revenue: "Revenue",
        expense: "Expenses",
        client_name: "Client",
      },
      currency: "USD",
      period: {
        kind: "interval",
        start: "2026-10-01",
        endExclusive: "2026-11-01",
      },
    },
    {
      purpose: "delivery",
      entity: "project",
      fields: {
        entity_id: "Project ID",
        status: "Status",
        due_date: "Due date",
      },
      statusValues: { active: ["Doing"] },
      period: { kind: "snapshot", asOf },
    },
    {
      purpose: "resources",
      entity: "resource",
      fields: {
        entity_id: "Employee ID",
        assigned_hours: "Assigned hours",
        available_hours: "Available hours",
      },
      period: {
        kind: "interval",
        start: "2026-10-01",
        endExclusive: "2026-11-01",
      },
    },
  ];
  for (let tabId = 0; tabId < 3; tabId++)
    assert.equal(
      (
        await call(root + `/${id}/semantics`, "POST", {
          tabId,
          mapping: { ...meanings[tabId], entityNamespace: "scope-" + tabId },
        })
      ).status,
      200,
    );
  // Explicit departments are the permission boundary, not guessed names.
  let company = (await call(`/companies/${c.id}`)).data;
  await call(`/companies/${c.id}`, "PATCH", {
    version: company.version,
    data: { ...company.data, departments: ["Finance", "Delivery", "People"] },
  });
  // Update department via the existing map pipeline, with no changed field types.
  const catalog = (await call(root)).data;
  // Department mutation can assign a full workbook; then the test changes only persisted assignments to model independent pages.
  await f.pg.query(
    `UPDATE public.aynor_sheet_snapshots SET data=jsonb_set(jsonb_set(jsonb_set(data,'{sources,0,tabs,0,department}','"Finance"'),'{sources,0,tabs,1,department}','"Delivery"'),'{sources,0,tabs,2,department}','"People"') WHERE company_id=$1`,
    [c.id],
  );
  const initial = await call(api);
  assert.equal(initial.status, 200, JSON.stringify(initial.data));
  assert.deepEqual(initial.data.concerns, initial.data.executive.issues);
  assert.deepEqual(initial.data.scopes, initial.data.executive.scopes);
  assert.equal(initial.headers["Cache-Control"], "no-store");
  const legacy = (await call(root + "/intelligence")).data;
  const comparable = (metrics) =>
    metrics.map((m) => ({
      ...m,
      freshness: { ...m.freshness, evaluatedAt: 0 },
    }));
  assert.deepEqual(
    comparable(initial.data.metrics),
    comparable(legacy.metrics),
  );
  const stored = (
    await f.pg.query(
      "SELECT data FROM public.aynor_sheet_snapshots WHERE company_id=$1",
      [c.id],
    )
  ).rows[0].data;
  const expected = evaluateSemantics({
    catalog: {
      ...stored,
      revision: legacy.metrics[0].lineage.snapshotRevision,
    },
    companyId: c.id,
    timezone: "Asia/Karachi",
    now: initial.data.evaluatedAt,
  });
  assert.deepEqual(initial.data.metrics, expected.metrics);
  assert.equal(
    initial.data.metrics.find((m) => m.metricId === "finance.revenue").value,
    300,
  );
  const ctx = (
    await call(api + "/context?scope=" + id + ":0&period=month&tag=a&tag=b")
  ).data;
  assert.deepEqual(ctx.context.filters.tag, ["a", "b"]);
  assert.equal(ctx.context.period, "month");
  const evidencePath =
    api + `/evidence?sourceId=${id}&tabId=0&metricId=finance.revenue&revision=`;
  const evidence = await call(evidencePath + initial.data.datasetRevision);
  assert.equal(evidence.status, 200);
  assert.equal(evidence.data.metric.value, 300);
  assert.equal((await call(evidencePath)).status, 409);
  const user = (
    await f.pg.query("SELECT id FROM public.aynor_users WHERE email=$1", [
      env.INITIAL_OWNER_EMAIL,
    ])
  ).rows[0];
  const policy = {
    version: 1,
    worksheets: {
      [id + ":0"]: {
        category: "finance",
        sensitivity: "standard",
        recordColumns: ["Transaction ID", "Date", "Revenue", "Client"],
      },
      [id + ":1"]: {
        category: "delivery",
        sensitivity: "standard",
        recordColumns: ["Project ID", "Status", "Due date"],
      },
      [id + ":2"]: {
        category: "resources",
        sensitivity: "payroll",
        recordColumns: ["Employee ID", "Assigned hours", "Available hours"],
      },
    },
    grants: {
      [user.id]: {
        categories: ["finance", "delivery", "resources"],
        sensitivities: [],
      },
    },
  };
  async function savePolicy() {
    cookie = ownerCookie;
    await f.pg.query(
      "UPDATE public.aynor_members SET role='Owner',scope='[]' WHERE company_id=$1 AND user_id=$2",
      [c.id, user.id],
    );
    const current = (await call(`/companies/${c.id}`)).data;
    const saved = await call(`/companies/${c.id}`, "PATCH", {
      version: current.version,
      data: { ...current.data, intelligenceAccess: policy },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
  }
  async function role(name, scope = []) {
    await f.pg.query(
      "UPDATE public.aynor_members SET role=$1,scope=$2 WHERE company_id=$3 AND user_id=$4",
      [name, JSON.stringify(scope), c.id, user.id],
    );
  }
  await savePolicy();
  await role("Executive");
  let limited = await call(api);
  assert.equal(limited.status, 200);
  assert.deepEqual(
    [...new Set(limited.data.metrics.map((m) => m.scope))],
    [id + ":1"],
  );
  assert.ok(!JSON.stringify(limited.data).includes("Secret salary"));
  assert.ok(!JSON.stringify(limited.data).includes("Payroll"));
  assert.equal(
    (await call(evidencePath + limited.data.datasetRevision)).status,
    403,
  );
  assert.equal((await call(api + "?scope=" + id + ":0")).status, 403);
  assert.equal(
    (await call(root)).status,
    403,
    "Executive cannot access source management",
  );
  const noGrantFingerprint = limited.data.authorization.fingerprint;
  policy.grants[user.id].sensitivities = ["financial"];
  await savePolicy();
  await role("Executive");
  limited = await call(api);
  assert.ok(limited.data.metrics.some((m) => m.metricId === "finance.revenue"));
  assert.ok(
    !limited.data.metrics.some((m) => m.metricId === "resources.utilization"),
  );
  assert.notEqual(limited.data.authorization.fingerprint, noGrantFingerprint);
  const projected = await call(evidencePath + limited.data.datasetRevision);
  assert.equal(projected.status, 200);
  assert.deepEqual(
    [...projected.data.columns].sort(),
    ["Transaction ID", "Date", "Revenue", "Client"].sort(),
  );
  assert.ok(!JSON.stringify(projected.data).includes("999999"));
  assert.equal(projected.data.metric.lineage.fields.expense, undefined);
  const records = await call(
    api + `/records?scope=${id}:0&revision=${limited.data.datasetRevision}`,
  );
  assert.deepEqual(
    records.data.columns,
    policy.worksheets[id + ":0"].recordColumns,
  );
  assert.ok(!JSON.stringify(records.data).includes("Secret salary"));
  assert.equal(
    (
      await call(
        api + `/records?scope=${id}:2&revision=${limited.data.datasetRevision}`,
      )
    ).status,
    403,
  );
  await role("Department Manager", ["Delivery"]);
  limited = await call(api);
  assert.ok(limited.data.metrics.every((m) => m.department === "Delivery"));
  assert.equal((await call(api + "?department=Finance")).status, 403);
  await role("Viewer", ["Finance"]);
  limited = await call(api);
  assert.ok(limited.data.metrics.every((m) => m.department === "Finance"));
  assert.equal((await call(api, "POST", {})).status, 405);
  assert.equal(
    (await call(api + "/relationships?scope=" + id + ":1")).status,
    403,
  );
  assert.deepEqual((await call(api + "/relationships")).data.relationships, []);
  // No entitlement at all, and unclassified/new worksheets, fail closed.
  delete policy.grants[user.id];
  await savePolicy();
  await role("Executive");
  assert.equal((await call(api)).data.metrics.length, 0);
  policy.grants[user.id] = {
    categories: ["resources"],
    sensitivities: ["payroll"],
  };
  await savePolicy();
  await role("Executive");
  assert.ok(
    (await call(api)).data.metrics.some(
      (m) => m.metricId === "resources.utilization",
    ),
  );
  policy.worksheets[id + ":2"].sensitivity = "confidential";
  await savePolicy();
  await role("Executive");
  assert.equal(
    (await call(api)).data.metrics.length,
    0,
    "Payroll permission does not imply confidential access",
  );
  policy.grants[user.id].sensitivities = ["confidential"];
  await savePolicy();
  await role("Executive");
  assert.ok(
    (await call(api)).data.metrics.some(
      (m) => m.metricId === "resources.utilization",
    ),
  );
  delete policy.worksheets[id + ":2"];
  await savePolicy();
  await role("Executive");
  assert.equal((await call(api)).data.metrics.length, 0);
  await role("Admin");
  assert.ok(
    (await call(api)).data.metrics.some(
      (m) => m.metricId === "finance.revenue",
    ),
    "Admin retains full access without explicit grants",
  );
  const badPolicy = await call(`/companies/${c.id}`, "PATCH", {
    version: (await call(`/companies/${c.id}`)).data.version,
    data: {
      ...(await call(`/companies/${c.id}`)).data.data,
      intelligenceAccess: {
        ...policy,
        grants: { [user.id]: { categories: ["payroll"], sensitivities: [] } },
      },
    },
  });
  assert.equal(badPolicy.status, 400);
  assert.equal((await call(api + "?actor=another-user")).status, 400);
  // Source revisions and policy changes invalidate citations, even with unchanged row IDs.
  await savePolicy();
  const before = (await call(api)).data;
  await f.pg.query(
    "UPDATE public.aynor_sheet_snapshots SET revision=revision+1,data=jsonb_set(data,'{sources,0,tabs,0,table,rows,0,2}','125') WHERE company_id=$1",
    [c.id],
  );
  assert.equal((await call(evidencePath + before.datasetRevision)).status, 409);
  const changed = (await call(api)).data;
  assert.notEqual(before.datasetRevision, changed.datasetRevision);
  assert.equal(
    changed.metrics.find((m) => m.metricId === "finance.revenue").value,
    325,
  );
  assert.equal(
    (
      await call(
        `/companies/${other.id}/intelligence/evidence?sourceId=${id}&tabId=0&metricId=finance.revenue&revision=${changed.datasetRevision}`,
      )
    ).status,
    404,
  );
  const old = await call(api + "/context");
  await role("Viewer", ["Delivery"]);
  assert.notEqual(
    (await call(api + "/context")).data.authorization.fingerprint,
    old.data.authorization.fingerprint,
  );
  await f.pg.query(
    "DELETE FROM public.aynor_members WHERE company_id=$1 AND user_id=$2",
    [c.id, user.id],
  );
  assert.equal((await call(api)).status, 403);
  cookie = "";
  assert.equal((await call(api)).status, 401);
  // Database read function is not callable by browser database roles.
  await f.pg.exec("RESET ROLE; SET ROLE authenticated");
  await assert.rejects(() =>
    f.pg.query("SELECT public.aynor_intelligence_read($1,$2)", [user.id, c.id]),
  );
});
