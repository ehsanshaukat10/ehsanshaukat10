import {
  scenario,
  workspace,
  upload,
  expect,
  assert,
  responsive,
  origin,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "automatic import → no mandatory mapping → meaningful date question → optional free AI → quota fallback → saved manual override",
  async (page) => {
    const w = await workspace(page, "Automatic import browser");
    await page.goto(w.base + "/onboarding/integrations");
    await upload(
      page,
      "Finance.csv",
      Buffer.from("Date,Revenue,Expenses\n2026-10-29,1200,300"),
    );
    await expect(page.getByLabel("Automatic preparation")).toContainText(
      "Your data is ready.",
    );
    await expect(
      page.getByLabel("Property for Date", { exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/onboarding\/priorities$/);
    await page.goto(w.base + "/overview");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toContainText("1,200");
    await page.goto(w.base + "/settings/connections");
    await upload(
      page,
      "Dates.csv",
      Buffer.from("Date,Revenue,Expenses\n03/04/2026,2000,500"),
    );
    await page
      .getByRole("button", { name: "Review 1 quick check", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Which date order");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Day / month / year", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const data = await (
      await page.request.get(w.api + "/sheets/overview?period=all")
    ).json();
    const dates = data.data.tables.find((t) => t.parentTitle === "Dates.csv");
    assert.equal(dates.rows[0][0], "2026-04-03");
    assert.equal(dates.financial.totals.revenue, 2000);
    await page.request.post(origin + "/api/__fixture/ai", {
      data: { mode: "valid" },
    });
    await page.reload();
    await expect(page.locator(".auto-ai-consent")).toBeVisible();
    await page.locator(".auto-ai-consent input").check();
    await upload(
      page,
      "Events.csv",
      Buffer.from(
        "Opaque label,Category\nprivate-person@example.test,Unusual value",
      ),
    );
    const events = page
      .locator(".source-parent")
      .filter({ hasText: "Events.csv" });
    await expect(events).toContainText("AI-assisted · validated");
    let stats = await (
      await page.request.post(origin + "/api/__fixture/ai", {
        data: { mode: "valid" },
      })
    ).json();
    assert.equal(stats.calls, 1);
    assert.ok(!JSON.stringify(stats.metadata).includes("private-person"));
    await events
      .getByRole("button", { name: "Prepare again", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Your data is ready" }),
    ).toBeVisible();
    stats = await (
      await page.request.post(origin + "/api/__fixture/ai", {
        data: { mode: "valid" },
      })
    ).json();
    assert.equal(stats.calls, 1);
    await page
      .getByRole("button", { name: "Review mapping", exact: true })
      .click();
    await page
      .locator(".source-parent")
      .filter({ hasText: "Events.csv" })
      .getByRole("button", { name: "Edit mapping", exact: true })
      .click();
    await page
      .getByLabel("Department for this worksheet", { exact: true })
      .selectOption("Finance");
    await page
      .getByRole("button", { name: "Save mapping", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "worksheet page mapped" }),
    ).toBeVisible();
    await page
      .locator(".source-parent")
      .filter({ hasText: "Events.csv" })
      .getByRole("button", { name: "Prepare again", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Your data is ready" }),
    ).toBeVisible();
    const source = await (await page.request.get(w.sources)).json();
    assert.equal(
      source.sources.find((s) => s.title === "Events.csv").tabs[0].department,
      "Finance",
    );
    await page
      .getByRole("button", { name: "Connected sources", exact: true })
      .click();
    await page.request.post(origin + "/api/__fixture/ai", {
      data: { mode: "quota" },
    });
    await upload(
      page,
      "Fallback.csv",
      Buffer.from("Other label,Another field\nPreserved text,Another value"),
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
    const result = await (await page.request.get(w.sources)).json();
    const fallback = result.sources.find((s) => s.title === "Fallback.csv");
    assert.equal(fallback.tabs[0].mapped, true);
    assert.equal(fallback.tabs[0].automatic.origin, "local");
    assert.equal(fallback.automation.aiStatus, "quota");
    await page.screenshot({
      path: "/tmp/aynor-automatic-preparation.png",
      fullPage: true,
    });
    await responsive(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.request.post(origin + "/api/__fixture/ai", {
      data: { mode: "financial" },
    });
    const financial = await workspace(page, "AI financial proposal");
    await page.goto(financial.base + "/settings/connections");
    await page.locator(".auto-ai-consent input").check();
    await upload(
      page,
      "Receipts.csv",
      Buffer.from("Date,Gross receipts,Cash outflow\n2026-10-29,2500,900"),
    );
    let financialData = (
      await (
        await page.request.get(financial.api + "/sheets/overview?period=all")
      ).json()
    ).data;
    assert.equal(financialData.tables[0].financial, undefined);
    await page
      .getByRole("button", { name: "Review 1 quick check", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Gross receipts");
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: "Yes, use these recorded amounts",
        exact: true,
      })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    financialData = (
      await (
        await page.request.get(financial.api + "/sheets/overview?period=all")
      ).json()
    ).data;
    assert.equal(financialData.tables[0].financial.totals.profit, 1600);
  },
);
