import {
  scenario,
  workspace,
  origin,
  expect,
  assert,
} from "./fixtures/feedback-browser.mjs";
import fs from "node:fs";
const out = process.env.AYNOR_4D_ARTIFACTS || "/tmp/aynor-4d";
fs.mkdirSync(out, { recursive: true });
await scenario(
  "Goals: company/department creation, increase/reduce/threshold progress, edits/status, evidence/context, incompatible periods, stable refresh/retry and mobile",
  async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const credentials = {
      email: "goals-browser@example.test",
      password: "goals-browser-fixture-password-long",
    };
    assert.equal(
      (
        await page.request.post(origin + "/api/auth/signup", {
          data: { ...credentials, name: "Goal reviewer" },
        })
      ).status(),
      201,
    );
    await page.request.post(origin + "/api/__fixture/confirm-email", {
      data: { email: credentials.email },
    });
    const w = await workspace(page, "Northstar performance", credentials);
    let company = await (await page.request.get(w.api)).json();
    await page.request.patch(w.api, {
      data: {
        version: company.version,
        data: { ...company.data, departments: ["Finance", "Studio"] },
      },
    });
    const uploaded = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Business.xlsx",
        sheets: [
          {
            name: "Ledger",
            rows: [
              ["ID", "Date", "Revenue", "Expenses"],
              ["T1", "2026-10-01", 100, 50],
              ["T2", "2026-10-15", 200, 50],
            ],
          },
          {
            name: "Projects",
            rows: [
              ["Project ID", "Project name", "Status", "Due date"],
              ["P1", "Portal", "Doing", "2026-10-01"],
              ["P2", "Billing", "Doing", "2026-10-02"],
            ],
          },
        ],
      },
    });
    assert.ok(uploaded.ok(), await uploaded.text());
    const id = (await uploaded.json()).selectedId;
    await page.request.post(w.sources + `/${id}/prepare`, {
      data: { allowAi: false },
    });
    for (const [tabId, department] of [
      [0, "Finance"],
      [1, "Studio"],
    ]) {
      await page.goto(w.base + `/connections?map=1&source=${id}&tab=${tabId}`);
      await page
        .getByLabel("Department for this worksheet", { exact: true })
        .selectOption(department);
      await page
        .getByRole("button", { name: "Save mapping", exact: true })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: /worksheet page.*mapped/ }),
      ).toBeVisible();
    }
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
        entityNamespace: "finance-ledger",
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
      {
        purpose: "delivery",
        entity: "project",
        entityNamespace: "project-register",
        fields: {
          entity_id: "Project ID",
          project_name: "Project name",
          status: "Status",
          due_date: "Due date",
        },
        statusValues: { active: ["Doing"], closed: ["Done"] },
        period: { kind: "snapshot", asOf },
      },
    ];
    for (let tabId = 0; tabId < 2; tabId++) {
      const r = await page.request.post(w.sources + `/${id}/semantics`, {
        data: { tabId, mapping: mappings[tabId] },
      });
      assert.ok(r.ok(), await r.text());
    }
    const before = await (
      await page.request.get(w.api + "/intelligence")
    ).json();
    const shot = async (n, fullPage = true) => {
      await page.waitForTimeout(250);
      await page.screenshot({ path: out + "/" + n + ".png", fullPage });
    };
    const list = w.base + "/goals?period=month&tag=a&tag=b";
    await page.goto(list);
    await expect(
      page.getByRole("heading", { name: "No governed goals yet", exact: true }),
    ).toBeVisible();
    await shot("goals-empty");
    async function create({
      title,
      metricId,
      tabId = 0,
      target,
      baseline,
      direction = "increase",
      level = "company",
      threshold = "at_least",
      currency,
      screen,
    }) {
      await page
        .getByRole("button", { name: "Create goal", exact: true })
        .click();
      await page.getByLabel("Goal title", { exact: true }).fill(title);
      await page.getByLabel("Goal level", { exact: true }).selectOption(level);
      await page
        .getByLabel("Goal metric", { exact: true })
        .selectOption(id + ":" + tabId + "|" + metricId);
      await page
        .getByLabel("Target value", { exact: true })
        .fill(String(target));
      await page
        .getByLabel("Goal direction", { exact: true })
        .selectOption(direction);
      if (direction === "maintain")
        await page
          .getByLabel("Threshold rule", { exact: true })
          .selectOption(threshold);
      else if (baseline !== undefined)
        await page
          .getByLabel("Confirmed baseline (optional)", { exact: true })
          .fill(String(baseline));
      if (currency)
        await page.getByLabel("Goal currency", { exact: true }).fill(currency);
      await page
        .getByLabel("Goal deadline", { exact: true })
        .fill("2026-11-15");
      await page
        .getByLabel("Goal owner (optional)", { exact: true })
        .fill("Administrator assigned lead");
      if (screen) await shot(screen);
      await page
        .getByRole("button", { name: "Save goal", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("link").filter({ hasText: title }).last(),
      ).toBeVisible();
    }
    const title = "Grow recognized revenue";
    await create({
      title,
      metricId: "finance.revenue",
      target: 500,
      baseline: 100,
      screen: "create-goal-desktop",
    });
    await page.getByRole("link").filter({ hasText: title }).last().click();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Actual performance" }),
    ).toContainText("300.00");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Change progress" }),
    ).toContainText("50%");
    await shot("increase-goal-desktop");
    const goalPath = new URL(page.url()).pathname;
    await page.reload();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Change progress" }),
    ).toContainText("50%");
    await page
      .getByRole("link", { name: "Investigate evidence", exact: true })
      .click();
    await expect(page.locator(".live-records")).toContainText("T1");
    await expect(page.locator(".live-records tbody tr")).toHaveCount(2);
    await shot("goal-evidence");
    await page
      .getByRole("link", { name: "Back to investigation", exact: true })
      .click();
    assert.ok(new URL(page.url()).pathname.endsWith(goalPath));
    assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), [
      "a",
      "b",
    ]);
    await page.getByRole("button", { name: "Edit goal", exact: true }).click();
    await page
      .getByLabel("Goal reporting end (exclusive)", { exact: true })
      .fill("2026-12-01");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Performance needs review",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(/confirmed reporting period does not match/),
    ).toBeVisible();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Actual performance" }),
    ).toContainText("Unavailable");
    await shot("incompatible-goal");
    await page
      .getByRole("link", { name: "Review data connections", exact: true })
      .click();
    await page.getByRole("link", { name: "Back", exact: true }).click();
    assert.ok(new URL(page.url()).pathname.endsWith(goalPath));
    assert.equal(new URL(page.url()).searchParams.get("period"), "month");
    await page.getByRole("button", { name: "Edit goal", exact: true }).click();
    await page
      .getByLabel("Goal reporting end (exclusive)", { exact: true })
      .fill("2026-11-01");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Change progress" }),
    ).toContainText("50%");
    await page.getByRole("button", { name: "Pause goal", exact: true }).click();
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Performance is off target",
        exact: true,
      }),
    ).toHaveCount(0);
    await shot("paused-goal");
    await page
      .getByRole("button", { name: "Resume goal", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Performance is off target",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(list);
    await create({
      title: "Reduce operating expenses",
      metricId: "finance.expenses",
      target: 0,
      baseline: 200,
      direction: "decrease",
      level: "department",
    });
    await create({
      title: "Maintain zero overdue projects",
      metricId: "delivery.overdue_projects",
      tabId: 1,
      target: 0,
      direction: "maintain",
      threshold: "at_most",
      level: "department",
    });
    await page
      .getByRole("link")
      .filter({ hasText: "Reduce operating expenses" })
      .last()
      .click();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Change progress" }),
    ).toContainText("50%");
    await shot("decrease-goal");
    await page.goto(list);
    await page
      .getByRole("link")
      .filter({ hasText: "Maintain zero overdue projects" })
      .last()
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Outside confirmed threshold",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Threshold check" }),
    ).toContainText("Outside threshold");
    await shot("threshold-goal-desktop");
    const after = await (
      await page.request.get(w.api + "/intelligence")
    ).json();
    assert.deepEqual(
      after.metrics.map((m) => [m.metricId, m.value, m.state]),
      before.metrics.map((m) => [m.metricId, m.value, m.state]),
    );
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(list);
      await expect(
        page.getByRole("link").filter({ hasText: title }).last(),
      ).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) await shot("goals-mobile");
      await page.getByRole("link").filter({ hasText: title }).last().click();
      await expect(
        page.locator(".intel-kpi").filter({ hasText: "Change progress" }),
      ).toContainText("50%");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) {
        await shot("goal-mobile");
        await page
          .getByRole("button", { name: "Edit goal", exact: true })
          .click();
        await shot("edit-goal-mobile-top", false);
        await page
          .getByRole("button", { name: "Save goal", exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("button", { name: "Save goal", exact: true }),
        ).toBeInViewport();
        await shot("edit-goal-mobile-controls", false);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      }
      await page
        .getByRole("link", { name: "Investigate evidence", exact: true })
        .click();
      await expect(page.locator(".live-records")).toContainText("T1");
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) await shot("goal-evidence-mobile");
    }
    await page.goto(list);
    await expect(
      page.getByRole("link").filter({ hasText: title }).last(),
    ).toBeVisible();
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    await page.route("**/intelligence/goals*", async (route) => {
      await gate;
      await route.continue();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText("Updating goals…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link").filter({ hasText: title }).last(),
    ).toBeVisible();
    await shot("goals-updating");
    release();
    await page.unrouteAll({ behavior: "wait" });
    await expect(
      page.getByText("Updating goals…", { exact: true }),
    ).toHaveCount(0);
    await page.route("**/intelligence/goals*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Goal service temporarily unavailable" }),
      }),
    );
    await page.goto(list);
    await expect(
      page.getByRole("button", { name: "Retry goals", exact: true }),
    ).toBeVisible();
    await shot("goals-error");
    await page.unrouteAll({ behavior: "wait" });
    await page
      .getByRole("button", { name: "Retry goals", exact: true })
      .click();
    await expect(
      page.getByRole("link").filter({ hasText: title }).last(),
    ).toBeVisible();
    await shot("goals-desktop");
  },
);
