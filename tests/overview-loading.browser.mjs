import {
  scenario,
  workspace,
  upload,
  expect,
  assert,
  origin,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "overview first-load skeleton, retained metrics through SPA navigation, reload and failed refresh, company isolation and logout cleanup; visible live AI test",
  async (page) => {
    const w = await workspace(page, "Retained overview");
    await page.goto(w.base + "/connections");
    await upload(
      page,
      "Finance.csv",
      Buffer.from("Date,Revenue,Expenses\n2026-10-29,1357,246"),
    );
    let release;
    let gate = new Promise((r) => (release = r));
    let failure = false;
    await page.route("**/sheets/overview?period=*", async (route) => {
      await gate;
      if (failure)
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary reporting interruption" }),
        });
      else await route.continue();
    });
    await page.goto(w.base + "/overview");
    await expect(page.getByLabel("Loading business overview")).toBeVisible();
    await expect(page.locator(".overview-skeleton .intel-kpi")).toHaveCount(4);
    await expect(page.locator(".overview-skeleton-bars i")).toHaveCount(12);
    release();
    const revenue = page.locator(".intel-kpi").filter({ hasText: "Revenue" });
    await expect(revenue).toContainText("1,357");
    await page
      .getByLabel("Main navigation")
      .getByRole("link", { name: "Data connections", exact: true })
      .click();
    gate = new Promise((r) => (release = r));
    await page
      .getByLabel("Main navigation")
      .getByRole("link", { name: "Overview", exact: true })
      .click();
    await expect(revenue).toContainText("1,357");
    await expect(page.getByLabel("Loading business overview")).toHaveCount(0);
    await page.reload();
    await expect(revenue).toContainText("1,357");
    await expect(page.getByLabel("Loading business overview")).toHaveCount(0);
    failure = true;
    release();
    await expect(page.getByRole("alert")).toContainText(
      "Temporary reporting interruption",
    );
    await expect(revenue).toContainText("1,357");
    failure = false;
    const other = await workspace(page, "Different company");
    gate = new Promise((r) => (release = r));
    await page.goto(other.base + "/overview");
    await expect(page.getByLabel("Loading business overview")).toBeVisible();
    await expect(revenue).toHaveCount(0);
    release();
    await expect(
      page.getByRole("heading", {
        name: "Connect your first spreadsheet",
        exact: true,
      }),
    ).toBeVisible();
    await page.goto(w.base + "/connections");
    await page.request.post(origin + "/api/__fixture/ai", {
      data: { mode: "quota" },
    });
    await page.reload();
    await page
      .getByRole("button", { name: "Test live AI connection", exact: true })
      .click();
    await expect(page.getByLabel("Live AI status")).toContainText(
      "OpenRouter’s request quota was reached",
    );
    await expect(page.getByLabel("Live AI status")).toContainText(
      "AI request attempted: Yes",
    );
    await expect(page.getByLabel("Live AI status")).toContainText(
      "Provider HTTP 429",
    );
    assert.equal(
      (await (await page.request.get(w.sources)).json()).sources[0].automation
        .aiStatus,
      "not_needed",
    );
    await expect(
      page.getByLabel("AI preparation status for Finance.csv"),
    ).toContainText("No AI inference was requested");
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    await expect(page).toHaveURL(/auth\/login$/);
    assert.equal(
      await page.evaluate(
        () =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith("aynor.overview."),
          ).length,
      ),
      0,
    );
  },
);
