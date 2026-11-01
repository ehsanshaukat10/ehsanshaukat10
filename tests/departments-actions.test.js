import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
test("Departments and Actions share exact governed facts; decisions/tasks persist with scope isolation, revision fences and immutable origins", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "actions@example.test",
    INITIAL_OWNER_PASSWORD: "actions-fixture-password-long",
  };
  let race = false;
  let app = createApplication({
      env,
      fetchImpl: async (input, options) => {
        if (race && String(input).endsWith("/rpc/aynor_action_write")) {
          race = false;
          await f.pg.query(
            "UPDATE public.aynor_sheet_snapshots SET revision=revision+1",
          );
        }
        return f.fetchImpl(input, options);
      },
    }),
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
  await call("/auth/login", "POST", {
    email: env.INITIAL_OWNER_EMAIL,
    password: env.INITIAL_OWNER_PASSWORD,
  });
  const c = (
    await call("/companies", "POST", {
      name: "Business",
      industry: "Services",
      country: "Pakistan",
      currency: "USD",
      timezone: "Asia/Karachi",
    })
  ).data;
  const other = (
    await call("/companies", "POST", {
      name: "Other",
      industry: "Services",
      country: "Pakistan",
      currency: "USD",
      timezone: "Asia/Karachi",
    })
  ).data;
  const root = `/companies/${c.id}`,
    sources = root + "/sources",
    api = root + "/intelligence",
    actions = api + "/actions";
  const uploaded = await call(sources, "POST", {
    mode: "upload",
    name: "Business.xlsx",
    sheets: [
      {
        name: "Ledger",
        rows: [
          ["Transaction ID", "Date", "Revenue", "Expenses"],
          ["T1", "2026-10-01", 100, 150],
          ["T2", "2026-10-02", 200, 200],
        ],
      },
      {
        name: "Projects",
        rows: [
          ["Project ID", "Project name", "Status", "Due date"],
          ["P1", "Portal", "Doing", "2026-10-01"],
          ["P2", "Billing", "Doing", "2026-10-02"],
          ["P3", "Archive", "Done", "2026-10-01"],
        ],
      },
      {
        name: "Capacity",
        rows: [
          ["Employee ID", "Assigned hours", "Available hours"],
          ["E1", 100, 80],
        ],
      },
    ],
  });
  assert.equal(uploaded.status, 200);
  const id = uploaded.data.selectedId;
  await call(sources + `/${id}/prepare`, "POST", { allowAi: false });
  const asOf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const mappings = [
    {
      purpose: "finance",
      entity: "transaction",
      fields: {
        entity_id: "Transaction ID",
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
    },
    {
      purpose: "delivery",
      entity: "project",
      fields: {
        entity_id: "Project ID",
        project_name: "Project name",
        status: "Status",
        due_date: "Due date",
      },
      statusValues: { active: ["Doing"], closed: ["Done"] },
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
        await call(sources + `/${id}/semantics`, "POST", {
          tabId,
          mapping: {
            ...mappings[tabId],
            entityNamespace: "namespace-" + tabId,
          },
        })
      ).status,
      200,
    );
  const actor = (
    await f.pg.query("SELECT id FROM public.aynor_users WHERE email=$1", [
      env.INITIAL_OWNER_EMAIL,
    ])
  ).rows[0].id;
  const policy = {
    version: 1,
    worksheets: {
      [id + ":0"]: {
        category: "finance",
        sensitivity: "financial",
        recordColumns: ["Transaction ID", "Date", "Revenue", "Expenses"],
      },
      [id + ":1"]: {
        category: "delivery",
        sensitivity: "standard",
        recordColumns: ["Project ID", "Project name", "Status", "Due date"],
      },
      [id + ":2"]: {
        category: "resources",
        sensitivity: "confidential",
        recordColumns: [],
      },
    },
    grants: { [actor]: { categories: ["delivery"], sensitivities: [] } },
  };
  const current = (await call(root)).data;
  await call(root, "PATCH", {
    version: current.version,
    data: {
      ...current.data,
      departments: ["Finance", "Studio", "People", "Empty"],
      intelligenceAccess: policy,
    },
  });
  await f.pg.query(
    `UPDATE public.aynor_sheet_snapshots SET data=jsonb_set(jsonb_set(jsonb_set(data,'{sources,0,tabs,0,department}','"Finance"'),'{sources,0,tabs,1,department}','"Studio"'),'{sources,0,tabs,2,department}','"People"') WHERE company_id=$1`,
    [c.id],
  );
  const overview = (await call(api)).data,
    studio = (await call(api + "?department=Studio&period=month&tag=a&tag=b"))
      .data;
  assert.deepEqual(
    studio.metrics.map((m) => [m.metricId, m.value, m.unit, m.period]),
    overview.metrics
      .filter((m) => m.department === "Studio")
      .map((m) => [m.metricId, m.value, m.unit, m.period]),
  );
  assert.deepEqual(studio.context.filters.tag, ["a", "b"]);
  assert.equal((await call(api + "?department=Empty")).data.metrics.length, 0);
  let items = (await call(actions)).data.items;
  assert.equal(items.length, 3);
  assert.ok(
    items.every(
      (x) => x.origin === "system" && x.why && x.next && x.fact && x.current,
    ),
  );
  for (const item of items) {
    const url = new URL(item.evidenceHref, "https://aynor.example");
    const evidence = await call(
      api +
        `/evidence?sourceId=${url.searchParams.get("source")}&tabId=${url.searchParams.get("tab")}&metricId=${url.searchParams.get("evidence")}&revision=${url.searchParams.get("revision")}`,
    );
    assert.equal(evidence.status, 200);
    assert.equal(evidence.data.metric.value, item.fact.value);
  }
  const project = items.find(
    (x) => x.fact.metricId === "delivery.overdue_projects",
  );
  assert.equal(project.fact.value, 2);
  assert.equal(
    (
      await call(actions + "/tasks", "POST", {
        title: "Forged",
        origin: "system",
      })
    ).status,
    400,
  );
  const task = {
    id: randomUUID(),
    title: "Review delivery plan",
    note: "User note",
    scope: id + ":1",
    department: "Studio",
    status: "Accepted",
    version: 0,
  };
  let saved = await call(actions + "/tasks", "POST", task);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.version, 1);
  assert.deepEqual(
    (await call(actions + "/tasks", "POST", task)).data,
    saved.data,
    "Retry of a create is idempotent",
  );
  const unlinked = await call(actions + "/tasks", "POST", {
    id: randomUUID(),
    title: "Private manual task",
    note: "Unclassified owner note",
    version: 0,
  });
  assert.equal(unlinked.status, 200);
  assert.equal(
    (
      await call(actions + "/tasks", "POST", {
        ...task,
        version: 1,
        status: "Completed",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(actions + "/tasks", "POST", {
        ...task,
        version: 1,
        status: "In Progress",
      })
    ).status,
    409,
  );
  const accepted = {
    version: 0,
    evidenceRevision: project.evidenceRevision,
    status: "Accepted",
    note: "Review with team",
    reason: "",
  };
  saved = await call(actions + "/decisions/" + project.id, "POST", accepted);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.version, 1);
  assert.equal(
    (await call(actions + "/decisions/recommendation-forged", "POST", accepted))
      .status,
    409,
  );
  assert.equal(
    (await call(api)).data.datasetRevision,
    overview.datasetRevision,
    "Decision persistence does not change source revisions or metrics",
  );
  app = createApplication({ env, fetchImpl: f.fetchImpl });
  items = (await call(actions)).data.items;
  assert.equal(items.find((x) => x.id === project.id).status, "Accepted");
  assert.equal(items.find((x) => x.id === task.id).origin, "user");
  await f.pg.query(
    `UPDATE public.aynor_sheet_snapshots SET revision=revision+1,data=jsonb_set(jsonb_set(data,'{sources,0,tabs,1,table,rows,0,2}','"Done"'),'{sources,0,workbook,1,values,1,2}','"Done"') WHERE company_id=$1`,
    [c.id],
  );
  assert.equal(
    (await call(actions)).data.items.find((x) => x.id === project.id).current,
    false,
    "Changed undated data requires reporting-scope reconfirmation",
  );
  assert.equal(
    (
      await call(sources + `/${id}/semantics`, "POST", {
        tabId: 1,
        mapping: { ...mappings[1], entityNamespace: "namespace-1" },
      })
    ).status,
    200,
  );
  items = (await call(actions)).data.items;
  const changed = items.find((x) => x.id === project.id);
  assert.equal(changed.fact.value, 1);
  assert.equal(changed.status, "Accepted");
  assert.equal(changed.evidenceChanged, true);
  assert.equal(
    (
      await call(actions + "/decisions/" + project.id, "POST", {
        ...accepted,
        version: 1,
      })
    ).status,
    409,
  );
  await f.pg.query(
    `UPDATE public.aynor_sheet_snapshots SET revision=revision+1,data=jsonb_set(jsonb_set(data,'{sources,0,tabs,1,table,rows,1,2}','"Done"'),'{sources,0,workbook,1,values,2,2}','"Done"') WHERE company_id=$1`,
    [c.id],
  );
  assert.equal(
    (
      await call(sources + `/${id}/semantics`, "POST", {
        tabId: 1,
        mapping: { ...mappings[1], entityNamespace: "namespace-1" },
      })
    ).status,
    200,
  );
  const historical = (await call(actions)).data.items.find(
    (x) => x.id === project.id,
  );
  assert.equal(historical.current, false);
  assert.equal(historical.support, "historical");
  assert.equal(historical.evidenceHref, null);
  assert.equal(historical.note, "Review with team");
  // Source state and authorization fence must still hold inside the SQL write transaction.
  app = createApplication({
    env,
    fetchImpl: async (input, options) => {
      if (race && String(input).endsWith("/rpc/aynor_action_write")) {
        race = false;
        await f.pg.query(
          "UPDATE public.aynor_sheet_snapshots SET revision=revision+1 WHERE company_id=$1",
          [c.id],
        );
      }
      return f.fetchImpl(input, options);
    },
  });
  race = true;
  assert.equal(
    (
      await call(actions + "/tasks", "POST", {
        ...task,
        version: 2,
        status: "In Progress",
      })
    ).status,
    409,
  );
  await f.pg.query(
    "UPDATE public.aynor_members SET role='Viewer',scope='[\"Studio\"]' WHERE company_id=$1 AND user_id=$2",
    [c.id, actor],
  );
  const restricted = (await call(actions)).data.items;
  assert.ok(restricted.every((x) => x.department === "Studio"));
  assert.ok(restricted.some((x) => x.id === task.id && x.origin === "user"));
  assert.ok(
    restricted.some((x) => x.id === project.id && x.support === "historical"),
  );
  assert.ok(!JSON.stringify(restricted).includes("Private manual task"));
  assert.ok(!restricted.some((x) => x.fact?.metricId === "finance.profit"));
  assert.equal((await call(api + "?department=Finance")).status, 403);
  assert.equal((await call(actions + "/tasks", "POST", task)).status, 403);
  assert.equal(
    (await call(actions + "/decisions/" + project.id, "POST", accepted)).status,
    403,
  );
  for (const role of ["Department Manager", "Executive"]) {
    await f.pg.query(
      "UPDATE public.aynor_members SET role=$1 WHERE company_id=$2 AND user_id=$3",
      [role, c.id, actor],
    );
    const view = await call(actions);
    assert.equal(view.status, 200);
    assert.ok(view.data.items.every((x) => x.department === "Studio"));
    assert.equal(
      (await call(api + "?department=Studio")).data.metrics.every(
        (m) => m.department === "Studio",
      ),
      true,
    );
    assert.equal((await call(actions + "/tasks", "POST", task)).status, 403);
  }
  await f.pg.query(
    "UPDATE public.aynor_members SET role='Owner',scope='[]' WHERE company_id=$1 AND user_id=$2",
    [c.id, actor],
  );
  assert.equal(
    (await call(`/companies/${other.id}/intelligence/actions`)).data.items
      .length,
    0,
  );
  assert.equal(
    (
      await call(`/companies/${other.id}/intelligence/actions/tasks`, "POST", {
        ...task,
        version: 2,
      })
    ).status,
    404,
  );
  await f.pg.exec("RESET ROLE;SET ROLE authenticated");
  await assert.rejects(() =>
    f.pg.query("SELECT * FROM public.aynor_action_records"),
  );
});
