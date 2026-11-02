import {
  scenario,
  workspace,
  expect,
  assert,
  responsive,
  origin,
  confirmFinancial,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "nine non-financial pages require business confirmation and stay separate; governed values and company-zone sync timestamps persist",
  async (page) => {
    const credentials = {
      email: "operational-customer@example.test",
      password: "operational-test-password-long",
    };
    assert.equal(
      (
        await page.request.post(origin + "/api/auth/signup", {
          data: { ...credentials, name: "Operational Customer" },
        })
      ).status(),
      201,
    );
    await page.request.post(origin + "/api/__fixture/confirm-email", {
      data: { email: credentials.email },
    });
    const w = await workspace(page, "Operational overview", credentials);
    const r = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Operations.xlsx",
        sheets: Array.from({ length: 9 }, (_, i) => ({
          name: `Page ${i + 1}`,
          rows: [
            ["Project ID", "Status", "Due date", "Qty"],
            ["00001", "Open", "2020-01-01", 1],
            ["00002", "Done", "2020-01-01", 2],
            ["00003", "Blocked", "2020-01-01", 3],
          ],
        })),
      },
    });
    assert.ok(r.ok());
    const id = (await r.json()).selectedId;
    assert.ok(
      (
        await page.request.post(w.sources + `/${id}/prepare`, {
          data: { allowAi: false },
        })
      ).ok(),
    );
    await page.goto(w.base + "/overview");
    await expect(
      page.getByRole("heading", {
        name: "Confirm your business reporting",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".intel-kpi")).toHaveCount(0);
    await expect(page.getByText("Qty", { exact: true })).toHaveCount(0);
    const asOf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const c = await page.request.post(w.sources + `/${id}/semantics`, {
      data: {
        tabId: 0,
        mapping: {
          label: "Delivery commitments",
          purpose: "delivery",
          entity: "project",
          entityNamespace: "confirmed-projects",
          fields: {
            entity_id: "Project ID",
            status: "Status",
            due_date: "Due date",
          },
          statusValues: { active: ["Open", "Blocked"], closed: ["Done"] },
          period: { kind: "snapshot", asOf },
        },
      },
    });
    assert.ok(c.ok(), await c.text());
    await page.reload();
    await expect(page.getByLabel("Primary business metrics")).toBeVisible();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Active projects" }),
    ).toContainText("2");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Overdue projects" }),
    ).toContainText("2");
    await expect(page.locator(".operational-preview")).toHaveCount(0);
    await expect(page.getByLabel("Reporting coverage")).toHaveCount(0);
    await page.goto(w.base + "/connections?records=1");
    await expect(
      page.getByLabel("Imported tables").getByRole("button"),
    ).toHaveCount(9);
    await page
      .getByLabel("Imported tables")
      .getByRole("button", { name: "Operations.xlsx / Page 9", exact: true })
      .click();
    await expect(
      page.getByLabel("Search this table", { exact: true }),
    ).toBeVisible();
    await responsive(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(w.base + "/connections");
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
      "Sync checked",
    );
    await expect(page.locator(".source-notice")).toContainText("Asia/Karachi");
    const source = (
      await (await page.request.get(w.sources)).json()
    ).sources.find((s) => s.title === "Live sync source");
    assert.equal(typeof source.lastChecked, "number");
    await expect(parent.locator("time").first()).toHaveAttribute(
      "dateTime",
      new Date(source.lastChecked).toISOString(),
    );
    await confirmFinancial(page, w);
    await page.goto(w.base + `/overview?scope=${source.id}:0`);
    const scopes = (
      await (await page.request.get(w.sources + "/intelligence")).json()
    ).executive.scopes;
    const financial = scopes.find((s) => s.sourceId === source.id);
    await page
      .getByLabel("Reporting scope", { exact: true })
      .selectOption(financial.id);
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toBeVisible();
    await expect(page.locator(".intel-notice time").first()).toContainText(
      "Asia/Karachi",
    );
  },
);
