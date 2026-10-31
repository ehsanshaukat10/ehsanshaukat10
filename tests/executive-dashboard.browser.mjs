import {
  scenario,
  workspace,
  expect,
  assert,
  responsive,
  origin,
} from "./fixtures/feedback-browser.mjs";
const asOf = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
await scenario(
  "governed executive reporting: explicit meanings, grouped financial metrics, delivery evidence, company-specific sales and capacity",
  async (page) => {
    const credentials = {
      email: "executive-customer@example.test",
      password: "executive-customer-password-long",
    };
    const signup = await page.request.post(origin + "/api/auth/signup", {
      data: { ...credentials, name: "Executive customer" },
    });
    assert.equal(signup.status(), 201);
    await page.request.post(origin + "/api/__fixture/confirm-email", {
      data: { email: credentials.email },
    });
    async function seed(w, sheets) {
      const r = await page.request.post(w.sources, {
        data: { mode: "upload", name: "Business.xlsx", sheets },
      });
      assert.ok(r.ok(), await r.text());
      const id = (await r.json()).selectedId;
      const p = await page.request.post(w.sources + `/${id}/prepare`, {
        data: { allowAi: false },
      });
      assert.ok(p.ok(), await p.text());
      return id;
    }
    async function review(w, id, tab) {
      await page.goto(
        w.base + `/connections?business=1&source=${id}&tab=${tab}`,
      );
      await expect(
        page.getByRole("dialog", {
          name: "Review business meanings",
          exact: true,
        }),
      ).toBeVisible();
    }
    async function confirm() {
      await page.getByRole("dialog").getByRole("checkbox").last().check();
      await page
        .getByRole("button", { name: "Confirm business meanings", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const w = await workspace(page, "Northstar Services", credentials);
    let c = await (await page.request.get(w.api)).json();
    await page.request.patch(w.api, {
      data: {
        version: c.version,
        data: { ...c.data, priorities: ["Profitability"] },
      },
    });
    const id = await seed(w, [
      {
        name: "Ledger",
        rows: [
          ["Entry ID", "Date", "Revenue", "Expenses"],
          ["T1", "2026-10-01", 12000, 4000],
          ["T2", "2026-10-15", 18000, 7000],
        ],
      },
      {
        name: "Delivery",
        rows: [
          ["Project ID", "Status", "Due date"],
          ["P1", "Doing", "2026-10-01"],
          ["P2", "Closed", "2026-10-01"],
          ["P3", "Doing", "2099-12-01"],
        ],
      },
      {
        name: "START HERE",
        rows: [
          ["Step", "Notes", "Qty"],
          ["Step 1", "Read instructions", 900],
          ["Step 2", "Click connect", 100],
        ],
      },
    ]);
    await page.goto(w.base + "/overview");
    await expect(
      page.getByRole("heading", {
        name: "Confirm your business reporting",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".intel-kpi")).toHaveCount(0);
    await review(w, id, 0);
    await page
      .getByLabel("Reporting name", { exact: true })
      .fill("Recognized trading");
    await page.getByLabel("Currency code", { exact: true }).fill("USD");
    await page
      .getByLabel("Reporting period starts", { exact: true })
      .fill("2026-10-01");
    await page
      .getByLabel("Reporting period ends", { exact: true })
      .fill("2026-10-31");
    await expect(
      page.getByRole("button", {
        name: "Confirm business meanings",
        exact: true,
      }),
    ).toBeDisabled();
    await page.screenshot({
      path: "/tmp/aynor-m3-after-confirmation.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Confirm business meanings", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "/tmp/aynor-m3-after-confirmation-period.png",
      fullPage: true,
    });

    await confirm();
    await page.goto(w.base + "/overview");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toContainText("30,000");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Operating profit" }),
    ).toContainText("19,000");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Operating expenses" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("img", {
        name: "Recognized revenue and operating expenses in USD",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Qty", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Explore imported records",
        exact: true,
      }),
    ).toHaveCount(0);
    await review(w, id, 1);
    await page
      .getByLabel("Reporting name", { exact: true })
      .fill("Delivery commitments");
    await page.getByLabel("Data is accurate as of", { exact: true }).fill(asOf);
    await page
      .getByLabel("Meaning of status doing", { exact: true })
      .selectOption("active");
    await page
      .getByLabel("Meaning of status closed", { exact: true })
      .selectOption("closed");
    await confirm();
    const deliveryView = await (
      await page.request.get(w.sources + "/intelligence")
    ).json();
    assert.equal(
      deliveryView.metrics.find(
        (m) => m.metricId === "delivery.overdue_projects",
      )?.state,
      "validated",
      JSON.stringify(deliveryView.worksheets.find((s) => s.tabId === 1)) +
        "\n" +
        JSON.stringify(
          deliveryView.metrics.filter((m) => m.lineage.tabId === 1),
        ),
    );
    await page.goto(w.base + "/overview");
    await expect(
      page.getByRole("heading", { name: "Needs attention", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Review overdue projects", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Investigate evidence", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Overdue projects.", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".live-records tbody tr")).toHaveCount(1);
    await expect(page.locator(".live-records")).toContainText("P1");
    await expect(page.locator(".live-records")).not.toContainText("P3");
    await page
      .getByRole("link", { name: "Back to overview", exact: true })
      .click();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toContainText("30,000");
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.screenshot({
      path: "/tmp/aynor-m3-after-overview.png",
      fullPage: true,
    });
    await responsive(page);
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.screenshot({
      path: "/tmp/aynor-m3-after-mobile.png",
      fullPage: true,
    });
    await page.goto(w.base + "/connections?records=1");
    await expect(page.getByLabel("Imported table dashboard")).toBeVisible();
    const sales = await workspace(page, "Helix SaaS", credentials);
    await page.request.post(sales.sources + "/semantic-config", {
      data: {
        fieldAliases: {
          entity_id: ["Opportunity key"],
          amount: ["Contract price"],
        },
      },
    });
    const sid = await seed(sales, [
      {
        name: "Bookings register",
        rows: [
          ["Opportunity key", "Closed date", "Contract price", "Stage"],
          ["D1", "2026-10-10", 5000, "Signed"],
          ["D2", "2026-10-15", 9000, "Dropped"],
        ],
      },
    ]);
    await review(sales, sid, 0);
    await page.getByLabel("Currency code", { exact: true }).fill("EUR");
    await page
      .getByLabel("Meaning of status signed", { exact: true })
      .selectOption("won");
    await page
      .getByLabel("Meaning of status dropped", { exact: true })
      .selectOption("lost");
    await confirm();
    await page.goto(sales.base + "/overview");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Won deal value" }),
    ).toContainText("5,000");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toHaveCount(0);
    const resources = await workspace(page, "Capacity practice", credentials),
      rid = await seed(resources, [
        {
          name: "Allocation",
          rows: [
            ["Employee ID", "Assigned hours", "Available hours"],
            ["E1", 50, 40],
            ["E2", 40, 40],
          ],
        },
      ]);
    await review(resources, rid, 0);
    await page
      .getByLabel("Reporting period starts", { exact: true })
      .fill("2026-10-01");
    await page
      .getByLabel("Reporting period ends", { exact: true })
      .fill("2026-10-31");
    await confirm();
    await page.goto(resources.base + "/overview");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Planned utilization" }),
    ).toContainText("112.5%");
    await expect(
      page.getByText("Planned capacity exceeded", { exact: true }),
    ).toBeVisible();
    await responsive(page);
  },
);
