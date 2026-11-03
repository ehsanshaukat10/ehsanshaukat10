import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureDatabase } from "./fixtures/serverless-database.mjs";
import { createApplication } from "../aynor-onboarding-frontend/source/server/application.mjs";

test("Sprint A: onboarding continuity, stable goal handoff, department fences and persisted field counts", async (t) => {
  const f = await fixtureDatabase();
  t.after(() => f.close());
  const env = {
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SECRET_KEY: "sb_secret_test_fixture_only",
    INITIAL_OWNER_EMAIL: "integrity@example.test",
    INITIAL_OWNER_PASSWORD: "integrity-password-long",
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
  const actor = (await call("/session")).data.user.id;
  const profile = {
    name: "Integrity company",
    industry: "Services",
    country: "Pakistan",
    currency: "USD",
    timezone: "Asia/Karachi",
  };
  const company = (await call("/companies", "POST", profile)).data;
  const other = (
    await call("/companies", "POST", { ...profile, name: "Other tenant" })
  ).data;
  const root = "/companies/" + company.id,
    api = root + "/intelligence/goals",
    sources = root + "/sources";
  async function update(change) {
    const c = (await call(root)).data;
    return call(root, "PATCH", {
      version: c.version,
      data: { ...c.data, ...change },
    });
  }
  const first = {
    id: randomUUID(),
    name: "Grow revenue",
    description: "Preserve original definition\nwithout guessing units.",
    kpi: "Revenue growth",
    target: "20% growth",
    deadline: "2026-12-31",
    owner: "Momina Liaqat",
  };
  const numeric = {
    ...first,
    id: randomUUID(),
    name: "Revenue target",
    target: "500",
  };
  await t.test(
    "new and existing onboarding definitions persist with ownership, no inferred progress",
    async () => {
      assert.equal(
        (
          await update({
            departments: ["Finance", "Support", "Unused"],
            goals: [first, numeric],
          })
        ).status,
        200,
      );
      let v = (await call(api)).data;
      assert.deepEqual(v.onboarding, [first, numeric]);
      assert.deepEqual(v.items, []);
      app = createApplication({ env, fetchImpl: f.fetchImpl });
      assert.deepEqual((await call(api)).data.onboarding, [first, numeric]);
      const before = v.companyVersion;
      const edited = await call(api + "/onboarding", "POST", {
        ...first,
        name: "Grow recognized revenue",
        companyVersion: before,
      });
      assert.equal(edited.status, 200, JSON.stringify(edited.data));
      assert.equal(
        (
          await call(api + "/onboarding", "POST", {
            ...first,
            companyVersion: before,
          })
        ).status,
        409,
      );
      v = (await call(api)).data;
      assert.equal(v.onboarding.length, 2);
      assert.equal(v.onboarding[0].owner, first.owner);
      assert.equal(v.onboarding[0].target, "20% growth");
      const foreign = await call(
        "/companies/" + other.id + "/intelligence/goals/onboarding",
        "POST",
        { ...first, companyVersion: other.version },
      );
      assert.equal(foreign.status, 404);
    },
  );
  let source, metricScope, goalInput;
  await t.test(
    "counts use saved imported columns and ignore excluded columns; same names in another tenant remain isolated",
    async () => {
      const r = await call(sources, "POST", {
        mode: "upload",
        name: "Ledger.xlsx",
        sheets: [
          {
            name: "Ledger",
            rows: [
              ["ID", "Date", "Revenue", "Expenses", "Notes"],
              ["T1", "2026-10-01", 100, 20, "private note"],
              ["T2", "2026-10-02", 200, 30, "another note"],
            ],
          },
        ],
      });
      assert.equal(r.status, 200);
      source = r.data.selectedId;
      await call(`${sources}/${source}/prepare`, "POST", { allowAi: false });
      const mapped = await call(`${sources}/${source}/map`, "POST", {
        tables: [
          {
            tabId: 0,
            headerRow: 0,
            dateFormat: "ymd",
            properties: ["text", "date", "money_in", "money_out", "ignore"],
            department: "Finance",
          },
        ],
      });
      assert.equal(mapped.status, 200, JSON.stringify(mapped.data));
      assert.equal(mapped.data.sources[0].tabs[0].mappedFieldCount, 4);
      metricScope = source + ":0";
      const sem = await call(`${sources}/${source}/semantics`, "POST", {
        tabId: 0,
        mapping: {
          purpose: "finance",
          entity: "transaction",
          entityNamespace: "integrity-ledger",
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
        },
      });
      assert.equal(sem.status, 200, JSON.stringify(sem.data));
      assert.equal(
        (await call("/companies/" + other.id + "/sources")).data.sources.length,
        0,
      );
    },
  );
  let beforeMetrics;
  await t.test(
    "explicit binding keeps the original ID and definition, and an exact retry never duplicates it",
    async () => {
      const v = (await call(api)).data;
      beforeMetrics = (await call(root + "/intelligence")).data.metrics.map(
        (m) => [m.metricId, m.value, m.state],
      );
      goalInput = {
        id: numeric.id,
        version: 0,
        companyVersion: v.companyVersion,
        title: numeric.name,
        description: numeric.description,
        owner: numeric.owner,
        deadline: numeric.deadline,
        level: "company",
        department: "",
        scope: metricScope,
        metricId: "finance.revenue",
        target: 500,
        unit: "currency",
        currency: "USD",
        period: {
          kind: "interval",
          start: "2026-10-01",
          endExclusive: "2026-11-01",
        },
        direction: "increase",
        baseline: 100,
        threshold: "at_least",
        lifecycle: "Active",
      };
      let r = await call(api, "POST", goalInput);
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal((await call(api, "POST", goalInput)).status, 200);
      const after = (await call(api)).data;
      assert.equal(after.items.length, 1);
      assert.equal(after.onboarding.length, 1);
      assert.equal(after.items[0].id, numeric.id);
      assert.equal(after.items[0].actual, 300);
      assert.equal(after.items[0].progress, 50);
      assert.equal(after.items[0].owner, numeric.owner);
      assert.equal(after.items[0].description, numeric.description);
      assert.deepEqual(after.items[0].onboardingDefinition, numeric);
      const c = (await call(root)).data;
      assert.equal(c.data.goals.length, 1);
      assert.equal(c.data.governedGoals.length, 1);
      const restored = await call(root, "PATCH", {
        version: c.version,
        data: { ...c.data, goals: [...c.data.goals, numeric] },
      });
      assert.equal(restored.status, 409);
      assert.deepEqual(
        (await call(root + "/intelligence")).data.metrics.map((m) => [
          m.metricId,
          m.value,
          m.state,
        ]),
        beforeMetrics,
      );
    },
  );
  await t.test(
    "department removal is atomic, preserves data, blocks worksheet/relationship references and permits explicit recovery",
    async () => {
      // A confirmed relationship scope also remains tied to its current worksheet department.
      const c = (await call(root)).data;
      const snap = (
        await f.pg.query(
          "SELECT data FROM public.aynor_sheet_snapshots WHERE company_id=$1",
          [company.id],
        )
      ).rows[0].data;
      const relation = {
        id: randomUUID(),
        label: "Existing confirmed contract",
        from: {
          scope: metricScope,
          entity: "invoice",
          idColumn: "ID",
          labelColumn: "",
          namespace: "integrity-ledger",
          schema: "recorded-schema",
        },
        to: {
          scope: metricScope,
          entity: "invoice",
          idColumn: "ID",
          labelColumn: "",
          namespace: "integrity-ledger",
          schema: "recorded-schema",
        },
        foreignKey: "ID",
        confirmed: true,
      };
      assert.equal(
        (await update({ relationshipContracts: [relation] })).status,
        200,
      );
      const remove = await update({ departments: ["Support", "Unused"] });
      assert.equal(remove.status, 409);
      assert.match(remove.data.error, /worksheet assignments/);
      const unchanged = (
        await f.pg.query(
          "SELECT data FROM public.aynor_sheet_snapshots WHERE company_id=$1",
          [company.id],
        )
      ).rows[0].data;
      assert.deepEqual(unchanged, snap);
      assert.ok((await call(root)).data.data.departments.includes("Finance"));
      assert.equal(
        (
          await call(`${sources}/${source}/department`, "POST", {
            department: "Support",
          })
        ).status,
        200,
      );
      const goalBlocked = await update({ departments: ["Support", "Unused"] });
      assert.equal(goalBlocked.status, 409);
      assert.match(goalBlocked.data.error, /goals/);
      const v = (await call(api)).data,
        g = v.items[0];
      const archive = await call(api, "POST", {
        ...goalInput,
        version: g.version,
        companyVersion: v.companyVersion,
        lifecycle: "Archived",
      });
      assert.equal(archive.status, 200, JSON.stringify(archive.data));
      assert.equal((await update({ departments: ["Support"] })).status, 200);
      const stored = (await call(sources)).data.sources[0];
      assert.equal(stored.tabs[0].department, "Support");
      assert.equal(stored.tabs[0].mappedFieldCount, 4);
      assert.equal(
        (await call(root)).data.data.relationshipContracts[0].id,
        relation.id,
      );
      assert.equal(
        (
          await call(`${sources}/${source}/department`, "POST", {
            department: "Finance",
          })
        ).status,
        422,
      );
      app = createApplication({ env, fetchImpl: f.fetchImpl });
      assert.equal(
        (await call(sources)).data.sources[0].tabs[0].mappedFieldCount,
        4,
      );
    },
  );
  await t.test(
    "late source publication cannot introduce a removed department",
    async () => {
      const row = (
        await f.pg.query(
          "SELECT data FROM public.aynor_sheet_snapshots WHERE company_id=$1",
          [company.id],
        )
      ).rows[0].data;
      const edited = structuredClone(row);
      edited.sources[0].department = "Finance";
      edited.sources[0].tabs[0].department = "Finance";
      await assert.rejects(
        f.pg.query(
          "UPDATE public.aynor_sheet_snapshots SET data=$1 WHERE company_id=$2",
          [JSON.stringify(edited), company.id],
        ),
        /Department configuration changed/,
      );
      assert.equal(
        (await call(sources)).data.sources[0].tabs[0].department,
        "Support",
      );
    },
  );
  await t.test(
    "pre-existing orphan assignments remain visible and can be explicitly repaired without losing records",
    async () => {
      const row = (
        await f.pg.query(
          "SELECT data FROM public.aynor_sheet_snapshots WHERE company_id=$1",
          [company.id],
        )
      ).rows[0].data;
      const legacy = structuredClone(row);
      legacy.sources[0].department = "Previously removed";
      legacy.sources[0].tabs[0].department = "Previously removed";
      legacy.sources[0].tabs[0].config.department = "Previously removed";
      // Simulate an existing pre-migration inconsistency, never a production repair.
      await f.pg.exec(
        "RESET ROLE; ALTER TABLE public.aynor_sheet_snapshots DISABLE TRIGGER aynor_workflow_source_guard",
      );
      try {
        await f.pg.query(
          "UPDATE public.aynor_sheet_snapshots SET data=$1 WHERE company_id=$2",
          [JSON.stringify(legacy), company.id],
        );
      } finally {
        await f.pg.exec(
          "ALTER TABLE public.aynor_sheet_snapshots ENABLE TRIGGER aynor_workflow_source_guard; SET ROLE service_role",
        );
      }
      const listed = (await call(sources)).data;
      assert.equal(
        listed.invalidDepartments[0].department,
        "Previously removed",
      );
      assert.equal(listed.sources[0].tabs[0].mappedFieldCount, 4);
      assert.equal(
        (
          await call(`${sources}/${source}/department`, "POST", {
            department: "Support",
          })
        ).status,
        200,
      );
      assert.deepEqual((await call(sources)).data.invalidDepartments, []);
      const repaired = (
        await f.pg.query(
          "SELECT data FROM public.aynor_sheet_snapshots WHERE company_id=$1",
          [company.id],
        )
      ).rows[0].data;
      assert.deepEqual(
        repaired.sources[0].tabs[0].table.rows,
        row.sources[0].tabs[0].table.rows,
      );
    },
  );
  await t.test(
    "restricted roles never receive or edit unbound company goals or mapping counts",
    async () => {
      for (const role of ["Viewer", "Department Manager", "Executive"]) {
        await f.pg.query(
          "UPDATE public.aynor_members SET role=$1,scope=$2 WHERE company_id=$3 AND user_id=$4",
          [role, '["Support"]', company.id, actor],
        );
        const v = await call(api);
        assert.equal(v.status, 200);
        assert.deepEqual(v.data.onboarding, []);
        assert.ok(!JSON.stringify(v.data).includes(first.owner));
        assert.equal(
          (
            await call(api + "/onboarding", "POST", {
              ...first,
              companyVersion: 1,
            })
          ).status,
          403,
        );
        assert.equal((await call(sources)).status, 403);
        assert.equal((await update({ departments: [] })).status, 403);
      }
      await f.pg.query(
        "UPDATE public.aynor_members SET role=$1,scope=$2 WHERE company_id=$3 AND user_id=$4",
        ["Owner", "[]", company.id, actor],
      );
    },
  );
  await t.test(
    "assigned access must be explicitly resolved before removing its department; unused removal and isolation work",
    async () => {
      assert.equal(
        (await update({ departments: ["Support", "Access-only", "Free"] }))
          .status,
        200,
      );
      const user = randomUUID();
      await f.pg.query(
        "INSERT INTO public.aynor_users(id,email,name,password,verified) VALUES($1,$2,$3,$4,true)",
        [
          user,
          "member-integrity@example.test",
          "Scoped member",
          "not-a-login-hash",
        ],
      );
      await f.pg.query(
        "INSERT INTO public.aynor_members(company_id,user_id,role,scope) VALUES($1,$2,$3,$4)",
        [company.id, user, "Viewer", '["Access-only"]'],
      );
      const blocked = await update({ departments: ["Support", "Free"] });
      assert.equal(blocked.status, 409);
      assert.match(blocked.data.error, /member or invitation/);
      await f.pg.query(
        "DELETE FROM public.aynor_members WHERE company_id=$1 AND user_id=$2",
        [company.id, user],
      );
      assert.equal((await update({ departments: ["Support"] })).status, 200);
      assert.equal(
        (await call("/companies/" + other.id)).data.version,
        other.version,
      );
    },
  );
  await t.test(
    "read-only database roles cannot execute the trigger helpers",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await f.pg.exec("SET ROLE " + role);
        await assert.rejects(
          f.pg.query("SELECT public.aynor_workflow_company_guard()"),
          /permission denied/,
        );
        await f.pg.exec("RESET ROLE;SET ROLE service_role");
      }
    },
  );
});
