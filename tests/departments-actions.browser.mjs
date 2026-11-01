import {
  scenario,
  workspace,
  origin,
  expect,
  assert,
} from "./fixtures/feedback-browser.mjs";
import fs from "node:fs";
const out = process.env.AYNOR_4B_ARTIFACTS || "/tmp/aynor-4b";
fs.mkdirSync(out, { recursive: true });
await scenario(
  "governed Departments and Actions: evidence parity, user tasks, contextual return, loading/retry, partial data and desktop/mobile",
  async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const credentials = {
      email: "departments-actions@example.test",
      password: "department-action-test-password-long",
    };
    assert.equal(
      (
        await page.request.post(origin + "/api/auth/signup", {
          data: { ...credentials, name: "Module reviewer" },
        })
      ).status(),
      201,
    );
    await page.request.post(origin + "/api/__fixture/confirm-email", {
      data: { email: credentials.email },
    });
    const w = await workspace(page, "Northstar operations", credentials);
    const company = await (await page.request.get(w.api)).json();
    await page.request.patch(w.api, {
      data: {
        version: company.version,
        data: {
          ...company.data,
          departments: ["Finance", "Studio", "People", "Pending"],
        },
      },
    });
    const raw = [
      {
        name: "Ledger",
        rows: [
          ["Transaction ID", "Date", "Revenue", "Expenses"],
          ["T1", "2026-10-01", 100, 150],
          ["T2", "2026-10-15", 200, 200],
        ],
      },
      {
        name: "Projects",
        rows: [
          ["Project ID", "Project name", "Owner", "Status", "Due date"],
          ["P1", "Customer portal", "Sara", "Doing", "2026-10-01"],
          ["P2", "Billing rollout", null, "Doing", "2026-10-02"],
          ["P3", "Released", "Ayesha", "Done", "2026-10-01"],
        ],
      },
      {
        name: "Capacity",
        rows: [
          ["Employee ID", "Assigned hours", "Available hours"],
          ["E1", 100, 80],
        ],
      },
    ];
    const created = await page.request.post(w.sources, {
      data: { mode: "upload", name: "Operations.xlsx", sheets: raw },
    });
    assert.ok(created.ok());
    const id = (await created.json()).selectedId;
    await page.request.post(w.sources + `/${id}/prepare`, {
      data: { allowAi: false },
    });
    // Exercise the existing mapping UI; source ingestion and confirmations are unchanged.
    for (const [tabId, department] of [
      [0, "Finance"],
      [1, "Studio"],
      [2, "People"],
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
    const meanings = [
      {
        purpose: "finance",
        entity: "transaction",
        fields: {
          entity_id: "Transaction ID",
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
        fields: {
          entity_id: "Project ID",
          project_name: "Project name",
          owner_name: "Owner",
          status: "Status",
          due_date: "Due date",
        },
        statusValues: { active: ["Doing"], closed: ["Done"] },
        period: { kind: "snapshot", asOf },
      },
      {
        purpose: "resources",
        entity: "resource",
        fields: {
          entity_id: "Employee ID",
          assigned_hours: "Assigned hours",
          available_hours: "Available hours",
        },
        period: {
          kind: "interval",
          start: "2026-10-01",
          endExclusive: "2026-11-01",
        },
      },
    ];
    for (let tabId = 0; tabId < 3; tabId++) {
      const r = await page.request.post(w.sources + `/${id}/semantics`, {
        data: {
          tabId,
          mapping: {
            ...meanings[tabId],
            entityNamespace: "namespace-" + tabId,
          },
        },
      });
      assert.ok(r.ok(), await r.text());
    }
    const shot = async (n) => {
      await page.waitForTimeout(350);
      await page.screenshot({ path: out + "/" + n + ".png", fullPage: true });
    };
    const base = w.base + "/departments?period=month&tag=a&tag=b";
    await page.goto(base);
    await expect(
      page.getByRole("heading", { name: "Departments.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link").filter({ hasText: "Studio" }).last(),
    ).toBeVisible();
    await shot("departments-desktop");
    await page.getByRole("link").filter({ hasText: "Studio" }).last().click();
    await expect(
      page.getByRole("heading", { name: "Studio.", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Overdue projects" }),
    ).toContainText("2");
    await shot("studio-desktop");
    await page
      .locator(".intel-kpi")
      .filter({ hasText: "Overdue projects" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Overdue projects.", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Investigate evidence", exact: true })
      .click();
    await expect(page.locator(".live-records")).toContainText(
      "Customer portal",
    );
    await expect(page.locator(".live-records tbody tr")).toHaveCount(2);
    await shot("department-evidence");
    await page
      .getByRole("link", { name: "Back to investigation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Overdue projects.", exact: true }),
    ).toBeVisible();
    assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), [
      "a",
      "b",
    ]);
    await page.goto(w.base + "/actions?period=month&tag=a&tag=b");
    await expect(
      page.getByRole("heading", { name: "Actions.", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".intel-action-row")).toHaveCount(3);
    await shot("actions-desktop");
    await page
      .locator(".intel-action-row")
      .filter({ hasText: "Review overdue projects" })
      .click();
    await expect(
      page.getByRole("heading", { name: "What happened?", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("System recommendation", { exact: true }),
    ).toBeVisible();
    await shot("recommendation-desktop");
    await page
      .getByRole("button", { name: "Accept recommendation", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Decision saved" }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByText("Accepted", { exact: true })).toBeVisible();
    await page
      .getByRole("link", { name: "Investigate evidence", exact: true })
      .click();
    await expect(page.locator(".live-records")).toContainText(
      "Billing rollout",
    );
    await page
      .getByRole("link", { name: "Back to investigation", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Your decision", exact: true }),
    ).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("period"), "month");
    await page.goto(w.base + "/actions?period=month&tag=a&tag=b");
    await page
      .getByRole("button", { name: "Create task", exact: true })
      .click();
    await page
      .getByLabel("Task title", { exact: true })
      .fill("Review delivery commitments");
    await page
      .getByLabel("Task note", { exact: true })
      .fill("User-entered follow-up, not an automated finding.");
    await page
      .getByLabel("Task reporting scope", { exact: true })
      .selectOption(id + ":1");
    await shot("create-task-desktop");
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page
        .locator(".intel-action-row")
        .filter({ hasText: "Review delivery commitments" }),
    ).toContainText("User-created task");
    await page.reload();
    await expect(
      page
        .locator(".intel-action-row")
        .filter({ hasText: "Review delivery commitments" }),
    ).toBeVisible();
    await shot("actions-with-task");
    await page
      .locator(".intel-action-row")
      .filter({ hasText: "Review delivery commitments" })
      .click();
    await expect(
      page.getByText("User-created task", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "User-created task. This is not a system finding or a validated business metric.",
        { exact: true },
      ),
    ).toBeVisible();
    await shot("user-task-desktop");
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(
        w.base + "/departments/Studio?department=Studio&period=month",
      );
      await expect(
        page.getByRole("heading", { name: "Studio.", exact: true }),
      ).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) await shot("studio-mobile");
      await page.goto(w.base + "/actions?department=Studio&period=month");
      await expect(page.locator(".intel-action-row")).toHaveCount(2);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) {
        await shot("actions-mobile");
        await page
          .locator(".intel-action-row")
          .filter({ hasText: "Review overdue projects" })
          .click();
        await expect(
          page.getByRole("heading", { name: "What happened?", exact: true }),
        ).toBeVisible();
        await shot("recommendation-mobile");
      }
    }
    await page.goto(w.base + "/departments/Pending?department=Pending");
    await expect(
      page.getByRole("heading", {
        name: "No validated business measures",
        exact: true,
      }),
    ).toBeVisible();
    await shot("department-empty");
    await page.route("**/intelligence/actions?*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Actions temporarily unavailable" }),
      }),
    );
    await page.goto(w.base + "/actions");
    await expect(
      page.getByRole("button", { name: "Retry actions", exact: true }),
    ).toBeVisible();
    await shot("actions-error");
    await page.unroute("**/intelligence/actions?*");
    await page
      .getByRole("button", { name: "Retry actions", exact: true })
      .click();
    await expect(page.locator(".intel-action-row")).toHaveCount(4);
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("**/intelligence/actions?*", async (route) => {
      await gate;
      await route.continue();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByRole("status").filter({ hasText: "Updating actions" }),
    ).toBeVisible();
    await expect(page.locator(".intel-action-row")).toHaveCount(4);
    await shot("actions-updating");
    release();
    await page.unrouteAll({ behavior: "wait" });
    await page.goto(w.base + "/actions?department=Pending");
    await expect(
      page.getByRole("heading", {
        name: "No evidence-backed recommendations or tasks",
        exact: true,
      }),
    ).toBeVisible();
    await shot("actions-empty");
    // Partial financial mappings remain partial; unsupported profit is never shown as zero.
    const partial = await page.request.post(w.sources + `/${id}/semantics`, {
      data: {
        tabId: 0,
        mapping: {
          ...meanings[0],
          fields: {
            entity_id: "Transaction ID",
            date: "Date",
            revenue: "Revenue",
          },
          entityNamespace: "namespace-0",
        },
      },
    });
    assert.ok(partial.ok());
    await page.goto(w.base + "/departments/Finance?department=Finance");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toContainText("300");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Operating profit" }),
    ).toHaveCount(0);
    await shot("department-partial");
  },
);
