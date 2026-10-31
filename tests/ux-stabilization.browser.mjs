import {
  scenario,
  workspace,
  expect,
  assert,
  origin,
} from "./fixtures/feedback-browser.mjs";
import fs from "node:fs";
const artifacts =
  process.env.AYNOR_UX_ARTIFACTS || "/tmp/aynor-ux-stabilization";
fs.mkdirSync(artifacts, { recursive: true });
const asOf = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
await scenario(
  "UX stabilization: no overlap/overflow, contextual returns, confirmed evidence names, recovery and capacity concern",
  async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const credentials = {
      email: "ux-stabilization@example.test",
      password: "isolated-intelligence-password-long",
    };
    assert.equal(
      (
        await page.request.post(origin + "/api/auth/signup", {
          data: { ...credentials, name: "Isolated reviewer" },
        })
      ).status(),
      201,
    );
    await page.request.post(origin + "/api/__fixture/confirm-email", {
      data: { email: credentials.email },
    });
    const w = await workspace(page, "Stabilization review", credentials);
    const seed = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Stabilization.xlsx",
        sheets: [
          {
            name: "Ledger",
            rows: [
              ["Entry ID", "Date", "Revenue", "Expenses"],
              ["T1", "2026-10-01", 30000, 20000],
              ["T2", "2026-10-15", 25000, 15000],
            ],
          },
          {
            name: "Delivery",
            rows: [
              [
                "Project ID",
                "Project name",
                "Client",
                "Owner",
                "Status",
                "Due date",
              ],
              ["P1", "Customer portal", "Acme", "Sara", "Doing", "2026-10-01"],
              ["P2", "Billing rollout", "Nimbus", null, "Doing", "2026-10-02"],
              [
                "P3",
                "Future work",
                "Future Co",
                "Ayesha",
                "Doing",
                "2099-01-01",
              ],
            ],
          },
          {
            name: "Capacity",
            rows: [
              [
                "Employee ID",
                "Person name",
                "Assigned hours",
                "Available hours",
              ],
              ["E1", "Sara", 45, 40],
              ["E2", "Ayesha", 55, 40],
            ],
          },
        ],
      },
    });
    assert.ok(seed.ok(), await seed.text());
    const id = (await seed.json()).selectedId;
    assert.ok(
      (
        await page.request.post(w.sources + "/" + id + "/prepare", {
          data: { allowAi: false },
        })
      ).ok(),
    );
    async function screenshot(name) {
      await page.waitForTimeout(250);
      await page.screenshot({
        path: artifacts + "/" + name + ".png",
        fullPage: true,
      });
    }
    async function noOverflow() {
      const size = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
      }));
      assert.ok(size.content <= size.width, JSON.stringify(size));
    }
    async function meanings(tab, kind, fields = {}) {
      await page.goto(
        w.base + `/connections?business=1&source=${id}&tab=${tab}`,
      );
      const dialog = page.getByRole("dialog", {
        name: "Review business meanings",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      await page
        .getByLabel("What does this worksheet describe?", { exact: true })
        .selectOption(kind);
      for (const [label, value] of Object.entries(fields))
        await page
          .getByLabel("Column for " + label, { exact: true })
          .selectOption({ label: value });
      if (await page.getByLabel("Currency code", { exact: true }).count())
        await page.getByLabel("Currency code", { exact: true }).fill("USD");
      if (
        await page
          .getByLabel("Reporting period starts", { exact: true })
          .count()
      ) {
        await page
          .getByLabel("Reporting period starts", { exact: true })
          .fill("2026-10-01");
        await page
          .getByLabel("Reporting period ends", { exact: true })
          .fill("2026-10-31");
      }
      if (
        await page.getByLabel("Data is accurate as of", { exact: true }).count()
      )
        await page
          .getByLabel("Data is accurate as of", { exact: true })
          .fill(asOf);
      if (
        await page
          .getByLabel("Meaning of status doing", { exact: true })
          .count()
      )
        await page
          .getByLabel("Meaning of status doing", { exact: true })
          .selectOption("active");
      await dialog.getByRole("checkbox").last().check();
      await page
        .getByRole("button", { name: "Confirm business meanings", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
    }
    await meanings(0, "finance:transaction", {
      "Operating expenses": "Not available",
    });
    await meanings(1, "delivery:project", {
      "Project name (optional)": "Project name",
      "Client name (optional)": "Client",
      "Owner name (optional)": "Owner",
    });
    await meanings(2, "resources:resource", {
      "Person name (optional)": "Person name",
    });
    const scopes = [`${id}:0`, `${id}:1`, `${id}:2`];
    await page.request.post(w.sources + `/${id}/department`, {
      data: { department: "Finance" },
    });
    const context = new URLSearchParams({
      scope: scopes[1],
      period: "month",
      department: "Finance",
      status: "active",
    });
    context.append("tag", "one");
    context.append("tag", "two");
    const dashboard = w.base + "/overview?" + context;
    // Fixed toolbar is below the complete form at every supported test width.
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(w.base + `/connections?map=1&source=${id}&tab=0`);
      await expect(
        page.getByLabel("Department for this worksheet", { exact: true }),
      ).toBeVisible();
      await page.locator(".source-map-actions").scrollIntoViewIfNeeded();
      const bounds = await page
        .locator(".source-map-actions")
        .evaluate((el) => {
          const form = el.closest(".source-mapping-editor"),
            last = form.querySelector("input[type=number]");
          return {
            action: el.getBoundingClientRect().top,
            field: last.getBoundingClientRect().bottom,
            position: getComputedStyle(el).position,
          };
        });
      assert.equal(bounds.position, "static");
      assert.ok(bounds.action >= bounds.field, JSON.stringify(bounds));
      await noOverflow();
      if (width === 1440 || width === 390) await screenshot(`mapping-${width}`);
    }
    // A partial report with a long currency value must fit; no overflow hidden workaround.
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(
        w.base + "/overview?scope=" + encodeURIComponent(scopes[0]),
      );
      await expect(page.locator(".intel-kpi").first()).toContainText("55,000");
      await noOverflow();
      const lastValues = page.locator(".table-profile-bar > span:last-child");
      for (const value of await lastValues.all()) {
        const box = await value.boundingBox();
        assert.ok(box.x + box.width <= width);
      }
      if (width === 1440 || width === 390)
        await screenshot(`dashboard-${width}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(dashboard);
    await expect(
      page.getByLabel("Reporting scope", { exact: true }),
    ).toHaveValue(scopes[1]);
    // Scope selection preserves existing period/filters, rather than replacing the query.
    await page
      .getByLabel("Reporting scope", { exact: true })
      .selectOption(scopes[2]);
    await expect(
      page.getByText("Planned capacity exceeded", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Assigned hours exceed available capacity for this reporting period.",
        { exact: true },
      ),
    ).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("period"), "month");
    assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), [
      "one",
      "two",
    ]);
    // Every rendered connections entry point carries a validated same-company return.
    await page.locator("summary").filter({ hasText: "Data status" }).click();
    const direct = page
      .locator(".overview-source-details")
      .getByRole("link", { name: "Data connections", exact: true });
    assert.ok((await direct.getAttribute("href")).includes("returnTo="));
    await screenshot("capacity-concern-desktop");
    await page
      .getByRole("link", { name: "Data connections", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Data connections.", exact: true }),
    ).toBeVisible();
    const expectedReturn = new URL(page.url()).searchParams.get("returnTo");
    assert.equal(
      new URL(expectedReturn, origin).searchParams.get("scope"),
      scopes[2],
    );
    await page
      .getByRole("button", { name: "Map worksheet pages", exact: false })
      .click();
    await page
      .getByRole("button", { name: "Explore imported records", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Back to connected sources",
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      new URL(page.url()).searchParams.get("returnTo"),
      expectedReturn,
    );
    await page
      .getByRole("button", { name: "Back to connected sources", exact: true })
      .click();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/intelligence?scope=")),
      page.getByRole("link", { name: "Back", exact: true }).click(),
    ]);
    await expect(
      page.getByLabel("Reporting scope", { exact: true }),
    ).toHaveValue(scopes[2]);
    await expect(page.locator(".intel-kpi").first()).toContainText("125%");
    assert.equal(new URL(page.url()).searchParams.get("department"), "Finance");
    assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), [
      "one",
      "two",
    ]);
    // Refresh must retain scope after the response, not only while displaying cache.
    await page.reload();
    await expect(page.locator(".intel-kpi").first()).toContainText("125%");
    await screenshot("connections-return-desktop");
    await page
      .getByRole("link", { name: "Investigate evidence", exact: true })
      .and(page.locator('a[href*="evidence=delivery.overdue_projects"]'))
      .click();
    await expect(page.locator(".live-records")).toBeVisible();
    await expect(page.locator(".live-records")).toContainText(
      "Customer portal",
    );
    await expect(page.locator(".live-records")).toContainText("Acme");
    await expect(page.locator(".live-records")).toContainText("Sara");
    await expect(page.locator(".live-records tbody tr")).toHaveCount(2);
    await expect(page.locator(".live-records")).not.toContainText(
      "Future work",
    );
    await expect(page.locator(".live-records tbody tr").last()).toContainText(
      "—",
    );
    await screenshot("evidence-desktop");
    await page.setViewportSize({ width: 390, height: 1000 });
    await noOverflow();
    await screenshot("evidence-mobile");
    await page
      .locator(".operational-preview")
      .evaluate((el) => (el.scrollLeft = el.scrollWidth));
    await screenshot("evidence-mobile-context");
    await page
      .getByRole("link", { name: "Back to overview", exact: true })
      .click();
    await expect(page.locator(".intel-kpi").first()).toContainText("125%");
    assert.equal(new URL(page.url()).searchParams.get("period"), "month");
    // Cold and cached failures each expose exactly one recovery action, on mobile and desktop.
    for (const width of [1440, 390])
      for (const cold of [true, false]) {
        await page.setViewportSize({ width, height: 1000 });
        if (cold) await page.evaluate(() => sessionStorage.clear());
        await page.route("**/intelligence?*", (route) =>
          !route.request().url().includes("/context?")
            ? route.fulfill({
                status: 503,
                contentType: "application/json",
                body: JSON.stringify({ error: "Controlled review outage" }),
              })
            : route.continue(),
        );
        await page.reload();
        await expect(
          page.getByRole("button", { name: "Retry report", exact: true }),
        ).toHaveCount(1);
        await expect(
          page.getByRole("button", { name: "Retry report", exact: true }),
        ).toBeVisible();
        await noOverflow();
        if (!cold)
          await expect(page.locator(".intel-kpi").first()).toContainText(
            "125%",
          );
        await screenshot(`error-${cold ? "cold" : "cached"}-${width}`);
        await page.unroute("**/intelligence?*");
        await page
          .getByRole("button", { name: "Retry report", exact: true })
          .click();
        await expect(page.locator(".intel-kpi").first()).toContainText("125%");
      }
  },
);
