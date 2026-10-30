import {
  scenario,
  workspace,
  expect,
  assert,
  responsive,
  origin,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "nine mapped non-financial pages populate the overview without another click; syncing shows company-zone date/time",
  async (page) => {
    // Use a separate verified customer: prior journeys deliberately exercise
    // the shared fixture owner's real 90-mutation/minute protection.
    const credentials = {
      email: "operational-customer@example.test",
      password: "operational-test-password-long",
    };
    const signup = await page.request.post(origin + "/api/auth/signup", {
      data: { ...credentials, name: "Operational Customer" },
    });
    assert.equal(signup.status(), 201, await signup.text());
    assert.ok(
      (
        await page.request.post(origin + "/api/__fixture/confirm-email", {
          data: { email: credentials.email },
        })
      ).ok(),
    );
    const w = await workspace(page, "Operational overview", credentials);
    const source = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Operations.xlsx",
        sheets: Array.from({ length: 9 }, (_, i) => ({
          name: `Page ${i + 1}`,
          rows: [
            ["Ticket ID", "Status", "Due date", "Qty"],
            ["00001", "Open", "2020-01-01", 1],
            ["00002", "Done", "2020-01-01", 2],
            ["00003", "Blocked", "2020-01-01", 3],
          ],
        })),
      },
    });
    assert.ok(source.ok());
    const id = (await source.json()).selectedId;
    const prepared = await page.request.post(w.sources + `/${id}/prepare`, {
      data: { allowAi: false },
    });
    assert.ok(
      prepared.ok(),
      `Preparation HTTP ${prepared.status()}: ${await prepared.text()}`,
    );
    assert.ok(
      (
        await page.request.post(w.sources + `/${id}/department`, {
          data: { department: "QA" },
        })
      ).ok(),
    );
    await page.goto(w.base + "/overview");
    const activity = page.getByLabel("Recorded activity metrics");
    await expect(
      activity.locator(".intel-kpi").filter({ hasText: "Open / in progress" }),
    ).toContainText("9");
    await expect(
      activity.locator(".intel-kpi").filter({ hasText: "Completed / closed" }),
    ).toContainText("9");
    await expect(
      activity.locator(".intel-kpi").filter({ hasText: "Blocked / flagged" }),
    ).toContainText("9");
    await expect(
      activity.locator(".intel-kpi").filter({ hasText: "Overdue" }),
    ).toContainText("18");
    await expect(
      page.getByRole("heading", {
        name: "Status across your business",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".operational-departments")).toContainText("QA");
    await expect(page.locator(".operational-preview tbody tr")).toHaveCount(3);
    await expect(page.locator(".operational-preview")).toContainText("00001");
    await page.getByRole("button", { name: "Breakdown", exact: true }).click();
    await expect(page.locator(".ops-status-bars")).toBeVisible();
    await page
      .getByRole("button", { name: "Distribution", exact: true })
      .click();
    await expect(
      page.getByRole("img", { name: /Status distribution/ }),
    ).toBeVisible();
    await page
      .getByLabel("Filter preview records", { exact: true })
      .fill("00002");
    await expect(page.locator(".operational-preview tbody tr")).toHaveCount(1);
    await page.getByLabel("Filter preview records", { exact: true }).fill("");

    await expect(page.getByLabel("Reporting coverage")).toContainText(
      "9 mapped pages · 27 imported records",
    );
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toHaveCount(0);
    await expect(page.locator(".intel-notice time").first()).toContainText(
      "Asia/Karachi",
    );
    await page
      .getByLabel("Preview an imported worksheet", { exact: true })
      .selectOption("8");
    await expect(
      page.getByLabel("Preview an imported worksheet", { exact: true }),
    ).toHaveValue("8");
    await page
      .getByRole("button", { name: "View all records", exact: true })
      .click();
    await expect(
      page
        .getByLabel("Imported tables")
        .getByRole("button", { name: "Operations.xlsx / Page 9", exact: true }),
    ).toHaveClass(/primary/);
    await responsive(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByLabel("Main navigation")
      .getByRole("link", { name: "Data connections", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Add workbook", exact: true })
      .click();
    await page.getByRole("button", { name: "Paste URL", exact: true }).click();
    await page
      .getByLabel("Source name", { exact: true })
      .fill("Live sync source");
    await page
      .getByLabel("Sheet URL", { exact: true })
      .fill(
        "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
      );
    await page
      .getByRole("button", { name: "Add shared sheet", exact: true })
      .click();
    const parent = page
      .locator(".source-parent")
      .filter({ hasText: "Live sync source" });
    await expect(parent).toBeVisible();
    await parent.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(page.locator(".source-notice")).toContainText(
      "Sync checked all mapped pages at",
    );
    await expect(page.locator(".source-notice")).toContainText("Asia/Karachi");
    await expect(parent).toContainText("Last sync check:");
    const value = (
      await (await page.request.get(w.sources)).json()
    ).sources.find((s) => s.title === "Live sync source");
    assert.equal(typeof value.lastChecked, "number");
    await expect(parent.locator("time").first()).toHaveAttribute(
      "dateTime",
      new Date(value.lastChecked).toISOString(),
    );
    await page
      .getByLabel("Main navigation")
      .getByRole("link", { name: "Overview", exact: true })
      .click();
    await expect(page.getByLabel("Recorded activity metrics")).toBeVisible();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toBeVisible();
    await expect(page.locator(".intel-notice time").first()).toContainText(
      "Asia/Karachi",
    );
  },
);
