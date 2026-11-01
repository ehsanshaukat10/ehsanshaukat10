import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
test("governed goals persist through authorized workflows, preserve metric values, enforce scopes/tenants and invalidate incompatible evidence", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "goals@example.test",
    INITIAL_OWNER_PASSWORD: "goals-fixture-password-long",
  };
  let app = createApplication({ env, fetchImpl: f.fetchImpl }),
    cookie = "";
  async function call(path, method = "GET", body) {
    let status, data;
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
          if (h["Set-Cookie"]) cookie = h["Set-Cookie"].split(";")[0];
        },
        end(raw) {
          data = raw ? JSON.parse(raw) : null;
        },
      },
    );
    return { status, data };
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
  const profile = {
    name: "Goal company",
    industry: "Services",
    country: "Pakistan",
    currency: "USD",
    timezone: "Asia/Karachi",
  };
  const c = (await call("/companies", "POST", profile)).data,
    other = (await call("/companies", "POST", { ...profile, name: "Other" }))
      .data,
    root = `/companies/${c.id}`,
    sources = root + "/sources",
    api = root + "/intelligence/goals";
  let company = (await call(root)).data;
  assert.equal(
    (
      await call(root, "PATCH", {
        version: company.version,
        data: { ...company.data, departments: ["Finance", "Studio"] },
      })
    ).status,
    200,
  );
  const upload = (
      await call(sources, "POST", {
        mode: "upload",
        name: "Ledger.xlsx",
        sheets: [
          {
            name: "Ledger",
            rows: [
              ["ID", "Date", "Revenue", "Expenses"],
              ["T1", "2026-10-01", 100, 50],
              ["T2", "2026-10-15", 200, 50],
            ],
          },
        ],
      })
    ).data,
    id = upload.selectedId,
    scope = id + ":0";
  await call(sources + `/${id}/prepare`, "POST", { allowAi: false });
  await call(sources + `/${id}/department`, "POST", { department: "Finance" });
  const mapping = {
    purpose: "finance",
    entity: "transaction",
    entityNamespace: "ledger",
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
  assert.equal(
    (await call(sources + `/${id}/semantics`, "POST", { tabId: 0, mapping }))
      .status,
    200,
  );
  const actor = (
    await f.pg.query("SELECT id FROM public.aynor_users WHERE email=$1", [
      env.INITIAL_OWNER_EMAIL,
    ])
  ).rows[0].id;
  company = (await call(root)).data;
  await call(root, "PATCH", {
    version: company.version,
    data: {
      ...company.data,
      intelligenceAccess: {
        version: 1,
        worksheets: {
          [scope]: {
            category: "finance",
            sensitivity: "financial",
            recordColumns: ["ID", "Date", "Revenue"],
          },
        },
        grants: {
          [actor]: { categories: ["finance"], sensitivities: ["financial"] },
        },
      },
    },
  });
  const before = (await call(root + "/intelligence")).data;
  let view = (await call(api)).data;
  const input = {
    id: randomUUID(),
    version: 0,
    companyVersion: view.companyVersion,
    title: "Grow recognized revenue",
    level: "company",
    department: "",
    scope,
    metricId: "finance.revenue",
    target: 500,
    unit: "currency",
    currency: "USD",
    period: mapping.period,
    deadline: "2026-11-15",
    owner: "Administrator supplied owner",
    direction: "increase",
    threshold: "at_least",
    baseline: 100,
    lifecycle: "Active",
  };
  let saved = await call(api, "POST", input);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(
    (await call(api, "POST", input)).status,
    200,
    "A lost create response can be retried without duplication",
  );
  view = (await call(api + "?period=month&tag=a&tag=b")).data;
  assert.equal(view.items.length, 1);
  let goal = view.items[0];
  assert.equal(goal.actual, 300);
  assert.equal(goal.target, 500);
  assert.equal(goal.progress, 50);
  assert.equal(goal.assessment, "Below target");
  assert.deepEqual(view.context.filters.tag, ["a", "b"]);
  const evidence = new URL(goal.evidenceHref, "https://aynor.example");
  assert.equal(
    (
      await call(
        root +
          `/intelligence/evidence?sourceId=${id}&tabId=0&metricId=finance.revenue&revision=${evidence.searchParams.get("revision")}`,
      )
    ).data.metric.value,
    goal.actual,
  );
  assert.deepEqual(
    (await call(root + "/intelligence")).data.metrics.map((m) => [
      m.metricId,
      m.value,
      m.state,
    ]),
    before.metrics.map((m) => [m.metricId, m.value, m.state]),
  );
  app = createApplication({ env, fetchImpl: f.fetchImpl });
  assert.equal((await call(api)).data.items[0].progress, 50);
  assert.equal(
    (await call(api, "POST", { ...input, version: 1, target: 600 })).status,
    409,
  );
  const departmentGoal = {
    ...input,
    id: randomUUID(),
    companyVersion: (await call(api)).data.companyVersion,
    level: "department",
    department: "Finance",
    title: "Reduce expenses",
    metricId: "finance.expenses",
    direction: "decrease",
    baseline: 200,
    target: 0,
  };
  assert.equal((await call(api, "POST", departmentGoal)).status, 200);
  let goals = (await call(api)).data;
  assert.equal(
    goals.items.find((g) => g.id === departmentGoal.id).progress,
    50,
  );
  assert.equal(
    (
      await call(api, "POST", {
        ...input,
        id: randomUUID(),
        companyVersion: goals.companyVersion,
        unit: "count",
        currency: null,
      })
    ).status,
    400,
  );
  const mismatched = {
    ...input,
    id: randomUUID(),
    companyVersion: goals.companyVersion,
    currency: "EUR",
    title: "EUR target",
  };
  assert.equal((await call(api, "POST", mismatched)).status, 200);
  goals = (await call(api)).data;
  const eur = goals.items.find((g) => g.id === mismatched.id);
  assert.equal(eur.actual, null);
  assert.match(eur.reason, /currency/);
  assert.ok(eur.evidenceHref);
  const periodGoal = {
    ...input,
    id: randomUUID(),
    companyVersion: goals.companyVersion,
    title: "Different period",
    period: { ...mapping.period, endExclusive: "2026-12-01" },
  };
  assert.equal((await call(api, "POST", periodGoal)).status, 200);
  assert.equal(
    (await call(api)).data.items.find((g) => g.id === periodGoal.id).actual,
    null,
  );
  goals = (await call(api)).data;
  const marginGoal = {
    ...input,
    id: randomUUID(),
    companyVersion: goals.companyVersion,
    metricId: "finance.margin",
    unit: "percent",
    currency: "USD",
    target: 50,
    baseline: 0,
    title: "Improve operating margin",
  };
  assert.equal((await call(api, "POST", marginGoal)).status, 200);
  const margin = (await call(api)).data.items.find(
    (g) => g.id === marginGoal.id,
  );
  assert.equal(
    margin.actual,
    before.metrics.find((m) => m.metricId === "finance.margin").value,
  );
  assert.equal(margin.progress, (100 * margin.actual) / 50);
  for (const [role, scopes, sensitivities, visible] of [
    ["Viewer", ["Studio"], ["financial"], false],
    ["Department Manager", ["Finance"], ["financial"], true],
    ["Executive", [], [], false],
    ["Executive", [], ["financial"], true],
  ]) {
    await f.pg.query(
      "UPDATE public.aynor_members SET role=$1,scope=$2 WHERE company_id=$3 AND user_id=$4",
      [role, JSON.stringify(scopes), c.id, actor],
    );
    const data = (
      await f.pg.query("SELECT data FROM public.aynor_companies WHERE id=$1", [
        c.id,
      ])
    ).rows[0].data;
    data.intelligenceAccess.grants[actor].sensitivities = sensitivities;
    await f.pg.query(
      "UPDATE public.aynor_companies SET data=$1,version=version+1 WHERE id=$2",
      [JSON.stringify(data), c.id],
    );
    const r = await call(api);
    assert.equal(r.status, 200);
    assert.equal(r.data.items.length > 0, visible);
    if (!visible) assert.ok(!JSON.stringify(r.data).includes(input.title));
    assert.equal(
      (
        await call(api, "POST", {
          ...input,
          companyVersion: r.data.companyVersion,
        })
      ).status,
      403,
    );
  }
  await f.pg.query(
    "UPDATE public.aynor_members SET role='Owner',scope='[]' WHERE company_id=$1 AND user_id=$2",
    [c.id, actor],
  );
  assert.equal(
    (await call(`/companies/${other.id}/intelligence/goals`)).data.items.length,
    0,
  );
  assert.equal(
    (
      await call(`/companies/${other.id}/intelligence/goals`, "POST", {
        ...input,
        companyVersion: 1,
      })
    ).status,
    400,
  );
  // Stale sources and missing mappings do not fabricate progress; identity rebinding requires review.
  await f.pg.query(
    "UPDATE public.aynor_sheet_snapshots SET revision=revision+1,data=jsonb_set(data,'{sources,0,tabs,0,lastSuccess}','1') WHERE company_id=$1",
    [c.id],
  );
  goals = (await call(api)).data;
  assert.equal(goals.items[0].actual, null);
  assert.match(goals.items[0].reason, /stale/);
  await f.pg.query(
    "UPDATE public.aynor_sheet_snapshots SET revision=revision+1,data=jsonb_set(data,'{sources}','[]') WHERE company_id=$1",
    [c.id],
  );
  goals = (await call(api)).data;
  goal = goals.items.find((g) => g.id === input.id);
  assert.equal(goal.actual, null);
  assert.equal(goal.evidenceHref, null);
  const fields = [
    "id",
    "title",
    "level",
    "department",
    "scope",
    "metricId",
    "target",
    "unit",
    "currency",
    "period",
    "deadline",
    "owner",
    "direction",
    "threshold",
    "baseline",
    "lifecycle",
    "version",
  ];
  const archive = Object.fromEntries(fields.map((k) => [k, goal[k]]));
  assert.equal(
    (
      await call(api, "POST", {
        ...archive,
        lifecycle: "Archived",
        companyVersion: goals.companyVersion,
      })
    ).status,
    200,
    "An administrator can archive an orphaned goal without pretending its source is valid",
  );
});
