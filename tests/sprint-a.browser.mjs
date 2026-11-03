import {
  scenario,
  workspace,
  origin,
  expect,
  assert,
} from "./fixtures/feedback-browser.mjs";
import fs from "node:fs";
const out = process.env.AYNOR_SPRINT_A_ARTIFACTS || "/tmp/aynor-sprint-a";
fs.mkdirSync(out, { recursive: true });
await scenario(
  "Sprint A integrated goals, safe department removal, persisted mapping counts, errors and mobile",
  async (page) => {
    const w = await workspace(page, "Sprint A workflow company");
    const shot = async (n) => {
      await page.waitForTimeout(200);
      await page.screenshot({ path: out + "/" + n + ".png", fullPage: true });
    };
    const mobile = async (name) => {
      await page.setViewportSize({ width: 390, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await shot(name + "-mobile");
      await page.setViewportSize({ width: 1440, height: 1000 });
    };
    await page.goto(w.base + "/onboarding/goals");
    await page.getByLabel("Goal name", { exact: true }).fill("Grow revenue");
    await page.getByLabel("Target value", { exact: true }).fill("20% growth");
    await page
      .getByLabel("Goal owner (optional)", { exact: true })
      .fill("Momina Liaqat");
    await page.getByLabel("Deadline", { exact: true }).fill("2026-12-31");
    await page.locator("textarea").fill("Original descriptive outcome.");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Goal saved." }),
    ).toBeVisible();
    let company = await (await page.request.get(w.api)).json();
    const saved = company.data.goals[0];
    assert.equal(saved.target, "20% growth");
    assert.equal(saved.owner, "Momina Liaqat");
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Grow revenue", exact: true }),
    ).toBeVisible();
    await page.goto(w.base + "/goals");
    await page
      .getByRole("link")
      .filter({ hasText: "Grow revenue" })
      .last()
      .click();
    await expect(
      page.getByRole("heading", { name: "Grow revenue.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Target as entered: 20% growth", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/progress are not calculated/)).toBeVisible();
    await shot("onboarding-goal-visible");
    await mobile("onboarding-goal-visible");
    await page
      .getByRole("button", { name: "Edit goal definition", exact: true })
      .click();
    await page
      .getByLabel("Goal owner (optional)", { exact: true })
      .fill("Umair Ishaq");
    await page
      .getByLabel("Goal description (optional)", { exact: true })
      .fill("Edited definition remains unmeasured.");
    // A source/company write racing an edit must reject the stale edit, not overwrite it.
    company = await (await page.request.get(w.api)).json();
    await page.request.patch(w.api, {
      data: {
        version: company.version,
        data: { ...company.data, priorities: ["Profitability"] },
      },
    });
    await page
      .getByRole("button", { name: "Save goal definition", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "changed",
    );
    await shot("goal-edit-conflict");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await page.reload();
    await page
      .getByRole("button", { name: "Edit goal definition", exact: true })
      .click();
    await page
      .getByLabel("Goal owner (optional)", { exact: true })
      .fill("Umair Ishaq");
    await page
      .getByLabel("Goal description (optional)", { exact: true })
      .fill("Edited definition remains unmeasured.");
    await page
      .getByRole("button", { name: "Save goal definition", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByText("Owner (administrator assigned): Umair Ishaq", {
        exact: true,
      }),
    ).toBeVisible();
    const sourceResponse = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Ledger.xlsx",
        sheets: [
          {
            name: "Ledger",
            rows: [
              ["ID", "Date", "Revenue", "Expenses", "Notes"],
              ["T1", "2026-10-01", 100, 20, "private"],
              ["T2", "2026-10-02", 200, 30, "private"],
            ],
          },
        ],
      },
    });
    const source = (await sourceResponse.json()).selectedId;
    await page.request.post(w.sources + `/${source}/prepare`, {
      data: { allowAi: false },
    });
    await page.request.post(w.sources + `/${source}/map`, {
      data: {
        tables: [
          {
            tabId: 0,
            headerRow: 0,
            dateFormat: "ymd",
            department: "Finance",
            properties: ["text", "date", "money_in", "money_out", "ignore"],
          },
        ],
      },
    });
    await page.request.post(w.sources + `/${source}/semantics`, {
      data: {
        tabId: 0,
        mapping: {
          purpose: "finance",
          entity: "transaction",
          entityNamespace: "sprint-a-ledger",
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
      },
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Confirm goal metric", exact: true })
      .click();
    await expect(page.getByLabel("Target value", { exact: true })).toHaveValue(
      "",
    ); // no "20% growth" -> 20 coercion
    await page
      .getByLabel("Goal metric", { exact: true })
      .selectOption(source + ":0|finance.revenue");
    await page.getByLabel("Target value", { exact: true }).fill("500");
    await page
      .getByLabel("Confirmed baseline (optional)", { exact: true })
      .fill("100");
    await shot("explicit-goal-confirmation");
    await mobile("explicit-goal-confirmation");
    await page.getByRole("button", { name: "Save goal", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Actual performance" }),
    ).toContainText("300.00");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Change progress" }),
    ).toContainText("50%");
    await page
      .getByText("Original onboarding definition", { exact: true })
      .click();
    await expect(
      page.getByText("Target as entered: 20% growth", { exact: true }),
    ).toBeVisible();
    await shot("confirmed-goal-same-id");
    await mobile("confirmed-goal-same-id");
    company = await (await page.request.get(w.api)).json();
    assert.equal(company.data.goals.length, 0);
    assert.equal(company.data.governedGoals.length, 1);
    assert.equal(company.data.governedGoals[0].id, saved.id);
    await page.goto(w.base + "/onboarding/goals?return=overview");
    await expect(
      page.getByRole("link", { name: "Review or edit in Goals", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Review or edit in Goals", exact: true })
      .click();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Change progress" }),
    ).toContainText("50%");
    await page.goto(w.base + "/settings/departments");
    await expect(
      page
        .locator(".intel-row")
        .filter({ has: page.getByText("Finance", { exact: true }) }),
    ).toContainText("4 mapped fields");
    await shot("accurate-field-count");
    await page.route("**/sources", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Controlled count-read failure" }),
          })
        : route.continue(),
    );
    await page.reload();
    await expect(
      page.getByText("Mapping count unavailable", { exact: true }).first(),
    ).toBeVisible();
    await shot("mapping-count-error");
    await page.unroute("**/sources");
    await page
      .getByRole("button", { name: "Retry mapping counts", exact: true })
      .click();
    await expect(
      page.getByText("4 mapped fields", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: /Configure departments/ }).click();
    if (
      (await page
        .getByRole("button", { name: "Finance", exact: true })
        .getAttribute("aria-pressed")) === "true"
    )
      await page.getByRole("button", { name: "Finance", exact: true }).click();
    await page
      .getByRole("button", { name: "Save & return to settings", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "worksheet assignments",
    );
    await shot("department-removal-blocked");
    await mobile("department-removal-blocked");
    await page.goto(w.base + "/settings/departments");
    await expect(
      page.getByText("4 mapped fields", { exact: true }),
    ).toBeVisible();
    // Explicit source reassignment is allowed; active goal still protects its old scope definition.
    await page.request.post(w.sources + `/${source}/department`, {
      data: { department: "QA" },
    });
    await page.reload();
    await expect(
      page
        .locator(".intel-row")
        .filter({ has: page.getByText("QA", { exact: true }) }),
    ).toContainText("4 mapped fields");
    await page.getByRole("link", { name: /Configure departments/ }).click();
    if (
      (await page
        .getByRole("button", { name: "Finance", exact: true })
        .getAttribute("aria-pressed")) === "true"
    )
      await page.getByRole("button", { name: "Finance", exact: true }).click();
    await page
      .getByRole("button", { name: "Save & return to settings", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("goals");
    await shot("active-goal-removal-blocked");
    await page.goto(w.base + "/goals/" + saved.id);
    await page
      .getByRole("button", { name: "Archive goal", exact: true })
      .click();
    await expect(page.getByText("Archived", { exact: true })).toBeVisible();
    await page.goto(w.base + "/settings/departments");
    await page.getByRole("link", { name: /Configure departments/ }).click();
    if (
      (await page
        .getByRole("button", { name: "Finance", exact: true })
        .getAttribute("aria-pressed")) === "true"
    )
      await page.getByRole("button", { name: "Finance", exact: true }).click();
    await page
      .getByRole("button", { name: "Save & return to settings", exact: true })
      .click();
    await expect(page).toHaveURL(/settings\/departments/);
    await expect(page.getByText("Finance", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("4 mapped fields", { exact: true }),
    ).toBeVisible();
    await shot("department-resolved-safely");
    await page.reload();
    await expect(
      page.getByText("4 mapped fields", { exact: true }),
    ).toBeVisible();
    const raw = await (
      await page.request.get(w.api + "/sheets/overview?period=all")
    ).json();
    assert.equal(raw.data.tables[0].financial.totals.revenue, 300);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) await shot("resolved-mobile");
    }
    const other = await workspace(page, "Sprint A separate company");
    await page.goto(other.base + "/goals");
    await expect(page.getByText("Grow revenue", { exact: true })).toHaveCount(
      0,
    );
    await page.goto(other.base + "/settings/departments");
    await expect(
      page.getByText("0 mapped fields", { exact: true }),
    ).toHaveCount(2);
  },
);
