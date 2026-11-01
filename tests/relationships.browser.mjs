import {
  scenario,
  workspace,
  origin,
  expect,
  assert,
} from "./fixtures/feedback-browser.mjs";
import fs from "node:fs";
const out = process.env.AYNOR_4C_ARTIFACTS || "/tmp/aynor-4c";
fs.mkdirSync(out, { recursive: true });
await scenario(
  "Dependencies: confirmed mapping, executive resource fact, revision-bound evidence, context return, partial/empty/error/loading and mobile",
  async (page) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const credentials = {
      email: "dependencies@example.test",
      password: "dependencies-fixture-password-long",
    };
    assert.equal(
      (
        await page.request.post(origin + "/api/auth/signup", {
          data: { ...credentials, name: "Dependency reviewer" },
        })
      ).status(),
      201,
    );
    await page.request.post(origin + "/api/__fixture/confirm-email", {
      data: { email: credentials.email },
    });
    const w = await workspace(page, "Northstar delivery", credentials);
    let company = await (await page.request.get(w.api)).json();
    await page.request.patch(w.api, {
      data: {
        version: company.version,
        data: { ...company.data, departments: ["Studio", "People"] },
      },
    });
    const created = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Delivery.xlsx",
        sheets: [
          {
            name: "Projects",
            rows: [
              [
                "Project ID",
                "Project name",
                "Resource ID",
                "Status",
                "Due date",
              ],
              ["P1", "Customer portal", "R1", "Doing", "2026-10-01"],
              ["P2", "Billing rollout", "R1", "Doing", "2026-10-02"],
              ["P3", "Not assigned", null, "Done", "2026-10-03"],
              ["P4", "Unresolved reference", "R404", "Doing", "2026-10-04"],
            ],
          },
          {
            name: "People",
            rows: [
              [
                "Resource ID",
                "Person name",
                "Assigned hours",
                "Available hours",
              ],
              ["R1", "Sara", 20, 40],
              ["R2", "Ayesha", 20, 40],
            ],
          },
        ],
      },
    });
    assert.ok(created.ok(), await created.text());
    const id = (await created.json()).selectedId;
    assert.ok(
      (
        await page.request.post(w.sources + `/${id}/prepare`, {
          data: { allowAi: false },
        })
      ).ok(),
    );
    for (const [tabId, department] of [
      [0, "Studio"],
      [1, "People"],
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
    for (const [tabId, mapping] of [
      [
        0,
        {
          purpose: "delivery",
          entity: "project",
          fields: {
            entity_id: "Project ID",
            project_name: "Project name",
            status: "Status",
            due_date: "Due date",
          },
          statusValues: { active: ["Doing"], closed: ["Done"] },
        },
      ],
      [
        1,
        {
          purpose: "resources",
          entity: "resource",
          fields: {
            entity_id: "Resource ID",
            resource_name: "Person name",
            assigned_hours: "Assigned hours",
            available_hours: "Available hours",
          },
        },
      ],
    ]) {
      const r = await page.request.post(w.sources + `/${id}/semantics`, {
        data: {
          tabId,
          mapping: {
            ...mapping,
            entityNamespace: "dependency-" + tabId,
            period: { kind: "snapshot", asOf },
          },
        },
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
    await page.goto(w.base + "/dependencies?period=month&tag=a&tag=b");
    await expect(
      page.getByRole("heading", {
        name: "No confirmed relationships in this view",
        exact: true,
      }),
    ).toBeVisible();
    await shot("empty-desktop");
    await page
      .getByRole("button", { name: "Confirm relationship", exact: true })
      .click();
    await page
      .getByLabel("Relationship name", { exact: true })
      .fill("Projects reference assigned resources");
    await page
      .getByLabel("Source worksheet", { exact: true })
      .selectOption(id + ":0");
    await page
      .getByLabel("Source display name", { exact: true })
      .selectOption("Project name");
    await page
      .getByLabel("Reference ID column", { exact: true })
      .selectOption("Resource ID");
    await page
      .getByLabel("Referenced worksheet", { exact: true })
      .selectOption(id + ":1");
    await page
      .getByLabel("Referenced display name", { exact: true })
      .selectOption("Person name");
    await shot("mapping-desktop");
    await page
      .getByRole("button", { name: "Confirm ID mapping", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", {
        name: "Shared resource dependency: Sara · R1",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/2 distinct confirmed projects/)).toBeVisible();
    await expect(
      page.getByText(/1 empty references · 1 unresolved references/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review mapping", exact: true })
      .click();
    await page
      .getByLabel("Relationship name", { exact: true })
      .fill("Projects assigned to confirmed resources");
    await page
      .getByRole("button", { name: "Confirm ID mapping", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/2 distinct confirmed projects/)).toBeVisible();
    const after = await (
      await page.request.get(w.api + "/intelligence")
    ).json();
    assert.deepEqual(
      after.metrics.map((m) => [m.metricId, m.value, m.state]),
      before.metrics.map((m) => [m.metricId, m.value, m.state]),
    );
    await page
      .getByLabel("Reporting scope", { exact: true })
      .selectOption(id + ":1");
    await expect(page.getByText(/2 distinct confirmed projects/)).toBeVisible();
    assert.equal(new URL(page.url()).searchParams.get("scope"), id + ":1");
    await page.getByLabel("Reporting scope", { exact: true }).selectOption("");
    await shot("dependencies-desktop");
    await page.reload();
    await expect(page.getByText(/2 distinct confirmed projects/)).toBeVisible();
    await page
      .getByRole("link", {
        name: "Investigate Customer portal · P1",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Confirmed relationship",
        exact: true,
      }),
    ).toBeVisible();
    await shot("relationship-desktop");
    await page
      .getByRole("link", { name: "View source evidence", exact: true })
      .click();
    await expect(
      page
        .getByRole("heading", { name: "Delivery / Projects", exact: true })
        .or(
          page.getByRole("heading", {
            name: "Delivery.xlsx / Projects",
            exact: true,
          }),
        ),
    ).toBeVisible();
    await expect(
      page.locator(".intel-panel").filter({ hasText: "Resource ID" }).first(),
    ).toContainText("P1");
    await shot("evidence-desktop");
    let resumeEvidence;
    const evidenceGate = new Promise((resolve) => {
      resumeEvidence = resolve;
    });
    await page.route(
      "**/intelligence/relationship-evidence*",
      async (route) => {
        await evidenceGate;
        await route.continue();
      },
    );
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText("Updating relationships…", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".intel-panel").filter({ hasText: "Resource ID" }).first(),
    ).toContainText("P1");
    resumeEvidence();
    await page.unrouteAll({ behavior: "wait" });

    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "View source evidence", exact: true }),
    ).toBeVisible();
    assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), [
      "a",
      "b",
    ]);
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page.getByText(/2 distinct confirmed projects/)).toBeVisible();
    await page
      .getByRole("link", { name: "Review source mappings", exact: true })
      .click();
    await page.getByRole("link", { name: "Back", exact: true }).click();
    assert.ok(new URL(page.url()).pathname.endsWith("/dependencies"));
    assert.equal(new URL(page.url()).searchParams.get("period"), "month");
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(
        w.base + "/dependencies?department=Studio&period=month&tag=a&tag=b",
      );
      await expect(
        page.getByText(/2 distinct confirmed projects/),
      ).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) await shot("dependencies-mobile");
      if (width === 390) {
        await page
          .getByRole("button", { name: "Review mapping", exact: true })
          .click();
        await shot("mapping-mobile-top", false);
        await page
          .getByRole("button", { name: "Confirm ID mapping", exact: true })
          .scrollIntoViewIfNeeded();
        await expect(
          page.getByRole("button", { name: "Confirm ID mapping", exact: true }),
        ).toBeInViewport();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        await shot("mapping-mobile", false);
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
      }

      await page
        .getByRole("link", {
          name: "Investigate Customer portal · P1",
          exact: true,
        })
        .click();
      await page
        .getByRole("link", { name: "View source evidence", exact: true })
        .click();
      await expect(
        page
          .getByText("Snapshot row 1 · current authorized dataset revision")
          .first(),
      ).toBeVisible();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      if (width === 390) await shot("evidence-mobile");
    }
    await page.goto(w.base + "/dependencies");
    await expect(page.getByText(/2 distinct confirmed projects/)).toBeVisible();
    let release;
    const gate = new Promise((r) => (release = r));
    await page.route("**/intelligence/relationships*", async (route) => {
      await gate;
      await route.continue();
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      page.getByText("Updating relationships…", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/2 distinct confirmed projects/)).toBeVisible();
    await shot("updating-desktop");
    release();
    await page.unrouteAll({ behavior: "wait" });
    await expect(
      page.getByText("Updating relationships…", { exact: true }),
    ).toHaveCount(0);
    await page.route("**/intelligence/relationships*", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Dependency service temporarily unavailable",
        }),
      }),
    );
    await page.goto(w.base + "/dependencies");
    await expect(
      page.getByRole("button", { name: "Retry dependencies", exact: true }),
    ).toBeVisible();
    await shot("error-desktop");
    await page.unrouteAll({ behavior: "wait" });
    await page
      .getByRole("button", { name: "Retry dependencies", exact: true })
      .click();
    await expect(page.getByText(/2 distinct confirmed projects/)).toBeVisible();
  },
);
