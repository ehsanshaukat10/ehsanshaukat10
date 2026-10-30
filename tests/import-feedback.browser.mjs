import {
  scenario,
  workspace,
  upload,
  map,
  save,
  expect,
  assert,
  responsive,
  origin,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "feedback regression: stable loading, default AI choice, department inheritance, date conflicts, mapping Back, isolated source tabs, duplicate feedback and combined KPIs",
  async (page) => {
    await page.request.post(origin + "/api/__fixture/ai", {
      data: { mode: "quota" },
    });
    const w = await workspace(page, "Feedback regression");
    let release;
    const pending = new Promise((resolve) => (release = resolve));
    await page.route("**/sources", async (route) => {
      if (route.request().method() === "GET") await pending;
      await route.continue();
    });
    await page.goto(w.base + "/onboarding/mapping");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Loading your connected sources" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Connect a source first.",
        exact: true,
      }),
    ).toHaveCount(0);
    release();
    await expect(
      page.getByRole("heading", {
        name: "Connect a source first.",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(w.base + "/connections");
    await expect(
      page.getByRole("heading", { name: "Data connections.", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Add workbook", exact: true })
      .click();
    await expect(page.locator(".auto-ai-consent input")).toBeChecked();
    await expect(
      page
        .getByLabel("Main navigation")
        .getByRole("link", { name: "Data connections", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await upload(
      page,
      "Finance.csv",
      Buffer.from("Date,Revenue,Expenses,Currency\n2026-10-29,1000,200,USD"),
    );
    // Currency-marked financial data requires explicit recorded-amount approval.
    await page
      .getByRole("button", { name: "Review 1 quick check", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Use the recorded amounts", exact: true })
      .click();
    await page
      .getByLabel("Department for Finance.csv", { exact: true })
      .selectOption("QA");
    await expect(
      page.getByRole("status").filter({ hasText: "Department applied" }),
    ).toBeVisible();
    await upload(
      page,
      "Finance.csv",
      Buffer.from("Date,Revenue,Expenses,Currency\n2026-10-29,1000,200,USD"),
    );
    await expect(
      page.locator(".source-notice").filter({ hasText: "already connected" }),
    ).toBeVisible();
    assert.equal(
      (await (await page.request.get(w.sources)).json()).sources.length,
      1,
    );
    await page
      .getByRole("button", { name: "Connect Google", exact: true })
      .first()
      .click();
    await expect(
      page.getByText("No Google spreadsheets added yet.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".source-parent")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Upload sheet", exact: true })
      .click();
    await expect(page.locator(".source-parent")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Map worksheet pages", exact: false })
      .click();
    await map(page, "CSV", "QA");
    await expect(
      page.getByRole("button", { name: "Save mapping", exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel("Department for this worksheet", { exact: true })
      .selectOption("");
    await expect(
      page.getByRole("button", { name: "Save mapping", exact: true }),
    ).toBeEnabled();
    await save(page);
    await page.goto(w.base + "/onboarding/integrations");
    await upload(
      page,
      "Projects 2026.csv",
      Buffer.from(
        "Request Date,Target Date,Status\nOct 2,Oct 9,Open\nSep 20,Nov 1,Done",
      ),
    );
    await page
      .getByRole("button", { name: "Review 2 quick checks", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("without a year");
    await expect(page.getByRole("dialog")).not.toContainText("Which team owns");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Decide later", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Review mapping", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review mapping", exact: true }),
    ).toHaveCount(0);
    const project = page
      .locator(".source-parent")
      .filter({ hasText: "Projects 2026.csv" });
    await project
      .getByRole("button", { name: "Edit mapping", exact: true })
      .click();
    await page
      .getByLabel("Property for Request Date", { exact: true })
      .selectOption("date");
    await page
      .getByLabel("Property for Target Date", { exact: true })
      .selectOption("date");
    await expect(page.locator(".source-field-checks")).toContainText(
      "4 conflicting cells",
    );
    await page
      .getByLabel("Year for dates without a year", { exact: true })
      .fill("2026");
    await expect(page.locator(".source-field-checks")).toContainText(
      "All rows match",
    );
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/onboarding\/mapping$/);
    await expect(
      page.getByRole("button", { name: "Save mapping", exact: true }),
    ).toHaveCount(0);
    await expect(project).toBeVisible();
    await project
      .getByRole("button", { name: "Edit mapping", exact: true })
      .click();
    await page
      .getByLabel("Property for Request Date", { exact: true })
      .selectOption("date");
    await page
      .getByLabel("Property for Target Date", { exact: true })
      .selectOption("date");
    await page
      .getByLabel("Year for dates without a year", { exact: true })
      .fill("2026");
    await save(page);
    let report = (
      await (
        await page.request.get(w.api + "/sheets/overview?period=all")
      ).json()
    ).data;
    assert.equal(
      report.tables.find((t) => t.parentTitle === "Projects 2026.csv")
        .rows[0][0],
      "2026-10-02",
    );
    await page.goto(w.base + "/connections");
    await upload(
      page,
      "Extra.csv",
      Buffer.from("Date,Revenue,Expenses\n2026-10-29,250,50"),
    );
    await page.goto(w.base + "/overview");
    await expect(page.getByLabel("Combined business overview")).toBeVisible();
    await expect(
      page
        .getByLabel("USD business performance")
        .locator(".intel-kpi")
        .filter({ hasText: "Revenue" }),
    ).toContainText("1,000");
    await expect(
      page
        .getByLabel("PKR business performance")
        .locator(".intel-kpi")
        .filter({ hasText: "Revenue" }),
    ).toContainText("250");
    await expect(page.getByLabel("Imported tables")).toHaveCount(0);
    await page.route("**/sheets/overview?period=all", async (route) => {
      await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });
    await page.evaluate(() =>
      window.dispatchEvent(new Event("aynor:sheet-change")),
    );
    await expect(page.getByLabel("Combined business overview")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Connect your first spreadsheet",
        exact: true,
      }),
    ).toHaveCount(0);
    await responsive(page);
  },
);
