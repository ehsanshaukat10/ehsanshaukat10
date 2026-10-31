import { validateSemanticSettings } from "../aynor-onboarding-frontend/source/server/semantic-intelligence.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";
test("semantic confirmations and settings persist without changing imports; sync recalculates evidence and permissions isolate tenants", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "semantics@example.test",
    INITIAL_OWNER_PASSWORD: "semantic-password-long",
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
        writeHead(c, h) {
          status = c;
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
  async function company(name) {
    const r = await call("/companies", "POST", {
      name,
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    });
    assert.equal(r.status, 201);
    return r.data;
  }
  const c = await company("Semantic company"),
    other = await company("Other company"),
    root = `/companies/${c.id}/sources`;
  const settings = {
    fieldAliases: {
      entity_id: ["Entry"],
      revenue: ["Turnover"],
      expense: ["Spend"],
    },
    freshnessHours: 72,
    enabledMetrics: [
      "finance.revenue",
      "finance.expenses",
      "finance.profit",
      "finance.margin",
    ],
  };
  assert.equal(
    (await call(root + "/semantic-config", "POST", settings)).status,
    200,
  );
  const sheets = [
    {
      name: "Business ledger",
      rows: [
        ["Entry", "Date", "Turnover", "Spend"],
        ["T1", "2026-10-01", 100, 20],
        ["T2", "2026-10-02", 200, 30],
      ],
    },
    {
      name: "Instructions",
      rows: [
        ["Step", "Notes", "Qty"],
        ["Step 1", "Read instructions", 5],
        ["Step 2", "Click connect", 2],
      ],
    },
  ];
  const upload = await call(root, "POST", {
    mode: "upload",
    name: "Different-structure.xlsx",
    sheets,
  });
  assert.equal(upload.status, 200);
  const id = upload.data.selectedId;
  assert.ok(id);
  assert.equal(
    (await call(root + `/${id}/prepare`, "POST", { allowAi: false })).status,
    200,
  );
  const before = (await call(`/companies/${c.id}/sheets/overview?period=all`))
    .data;
  const mapping = {
    purpose: "finance",
    entity: "transaction",
    entityNamespace: "booked-ledger",
    fields: {
      entity_id: "Entry",
      date: "Date",
      revenue: "Turnover",
      expense: "Spend",
    },
    currency: "USD",
    period: {
      kind: "interval",
      start: "2026-10-01",
      endExclusive: "2026-11-01",
    },
  };
  const confirmed = await call(root + `/${id}/semantics`, "POST", {
    tabId: 0,
    mapping,
  });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(
    confirmed.data.metrics.find((m) => m.metricId === "finance.revenue").value,
    300,
  );
  const confirmation = confirmed.data.worksheets.find(
    (w) => w.tabId === 0,
  ).confirmation;
  assert.ok(confirmation.confirmedBy);
  assert.equal(confirmation.currency, "USD");
  const after = (await call(`/companies/${c.id}/sheets/overview?period=all`))
    .data;
  assert.deepEqual(
    after.data,
    before.data,
    "semantic confirmation must not alter existing overview/import results",
  );
  app = createApplication({ env, fetchImpl: f.fetchImpl });
  assert.deepEqual(
    (await call(root + "/semantic-config")).data,
    validateSemanticSettings(settings),
  );
  const read = await call(root + `/${id}/semantics`);
  assert.equal(read.status, 200);
  assert.deepEqual(
    read.data.worksheets.find((w) => w.tabId === 0).confirmation,
    confirmation,
  );
  assert.equal(
    read.data.worksheets.find((w) => w.tabId === 1).executiveEligible,
    false,
  );
  assert.equal(
    (await call(`/companies/${other.id}/sources/${id}/semantics`)).status,
    404,
  );
  // Replacing the same upload preserves stable identifiers and confirmations.
  sheets[0].rows[1][2] = 150;
  assert.equal(
    (
      await call(root, "POST", {
        mode: "upload",
        name: "Different-structure.xlsx",
        sheets,
      })
    ).status,
    200,
  );
  const updated = (await call(root + "/intelligence")).data;
  assert.equal(
    updated.metrics.find((m) => m.metricId === "finance.revenue").value,
    350,
  );
  assert.equal(
    updated.worksheets.find((w) => w.sourceId === id && w.tabId === 0)
      .confirmation.confirmedAt,
    confirmation.confirmedAt,
  );
  // A real private/public refresh follows the same catalog pipeline; new symbol evidence is checked.
  f.control.csv = "Transaction ID,Date,Revenue,Expenses\nR1,2026-10-01,100,20";
  const remote = await call(root, "POST", {
    mode: "public",
    url: "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
    name: "Remote ledger",
  });
  assert.equal(remote.status, 200);
  const rid = remote.data.selectedId;
  assert.equal(
    (await call(root + `/${rid}/prepare`, "POST", { allowAi: false })).status,
    200,
  );
  const tab = (await call(root)).data.sources.find((s) => s.id === rid).tabs[0];
  const rm = {
    ...mapping,
    entityNamespace: "remote",
    fields: {
      entity_id: "Transaction ID",
      date: "Date",
      revenue: "Revenue",
      expense: "Expenses",
    },
  };
  const rc = await call(root + `/${rid}/semantics`, "POST", {
    tabId: tab.tabId,
    mapping: rm,
  });
  assert.equal(rc.status, 200, JSON.stringify(rc.data));
  const find = (r) =>
    r.metrics.find(
      (m) => m.lineage.sourceId === rid && m.metricId === "finance.revenue",
    );
  assert.equal(find(rc.data).value, 100);
  f.control.csv = "Transaction ID,Date,Revenue,Expenses\nR1,2026-10-01,125,25";
  assert.equal((await call(root + `/${rid}/sync`, "POST", {})).status, 200);
  assert.equal(find((await call(root + "/intelligence")).data).value, 125);
  f.control.csv =
    "Transaction ID,Date,Revenue,Expenses\nR1,2026-10-01,EUR 125,EUR 25";
  assert.equal((await call(root + `/${rid}/sync`, "POST", {})).status, 200);
  const currencyChange = find((await call(root + "/intelligence")).data);
  assert.equal(currencyChange.state, "provisional");
  assert.equal(currencyChange.value, null);
  f.control.csv =
    "Transaction ID,Date,Sales total,Expenses\nR1,2026-10-01,125,25";
  assert.equal((await call(root + `/${rid}/sync`, "POST", {})).status, 200);
  assert.equal(find((await call(root + "/intelligence")).data).state, "stale");
  // Invalid confirmations cannot replace the persisted confirmation.
  assert.equal(
    (
      await call(root + `/${id}/semantics`, "POST", {
        tabId: 0,
        mapping: { ...mapping, fields: { entity_id: "Missing" } },
      })
    ).status,
    400,
  );
  assert.equal(
    (await call(root + `/${id}/semantics`)).data.worksheets.find(
      (w) => w.tabId === 0,
    ).confirmation.confirmedAt,
    confirmation.confirmedAt,
  );
  await f.pg.query(
    "UPDATE public.aynor_members SET role='Viewer' WHERE company_id=$1",
    [c.id],
  );
  assert.equal((await call(root + "/intelligence")).status, 403);
  assert.equal((await call(root + "/semantic-config")).status, 403);
  assert.equal(
    (await call(root + `/${id}/semantics`, "POST", { tabId: 0, mapping }))
      .status,
    403,
  );
  await f.pg.query("DELETE FROM public.aynor_members WHERE company_id=$1", [
    other.id,
  ]);
  assert.equal(
    (await call(`/companies/${other.id}/sources/intelligence`)).status,
    403,
  );
  // Unauthenticated requests cannot read semantic data either.
  cookie = "";
  assert.equal((await call(root + "/intelligence")).status, 401);
});
