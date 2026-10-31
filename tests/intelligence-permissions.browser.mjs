import {
  scenario,
  origin,
  workspace,
  expect,
  assert,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "shared Overview authorizes caches before rendering, preserves context, pins evidence and fails closed on permission changes",
  async (page) => {
    const credentials = {
      email: "intelligence-ux@example.test",
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
    const w = await workspace(page, "Authorized intelligence", credentials);
    const source = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Governed.xlsx",
        sheets: [
          {
            name: "Ledger",
            rows: [
              ["Transaction ID", "Date", "Revenue", "Expenses"],
              ["T1", "2026-10-01", 30000, 20000],
              ["T2", "2026-10-15", 25000, 15000],
            ],
          },
        ],
      },
    });
    assert.ok(source.ok());
    const id = (await source.json()).selectedId;
    await page.request.post(w.sources + `/${id}/prepare`, {
      data: { allowAi: false },
    });
    const confirm = await page.request.post(w.sources + `/${id}/semantics`, {
      data: {
        tabId: 0,
        mapping: {
          purpose: "finance",
          entity: "transaction",
          entityNamespace: "ledger",
          currency: "USD",
          fields: {
            entity_id: "Transaction ID",
            date: "Date",
            revenue: "Revenue",
            expense: "Expenses",
          },
          period: {
            kind: "interval",
            start: "2026-10-01",
            endExclusive: "2026-11-01",
          },
        },
      },
    });
    assert.ok(confirm.ok(), await confirm.text());
    const scope = id + ":0",
      url =
        w.base +
        "/overview?scope=" +
        encodeURIComponent(scope) +
        "&period=month&tag=a&tag=b";
    await page.goto(url);
    const revenue = page.locator(".intel-kpi").filter({ hasText: "Revenue" });
    await expect(revenue).toContainText("55,000");
    const snapshot = await (
      await page.request.get(
        w.api + "/intelligence?scope=" + scope + "&period=month&tag=a&tag=b",
      )
    ).json();
    assert.equal(snapshot.context.scope, scope);
    assert.deepEqual(snapshot.context.filters.tag, ["a", "b"]);
    // Cache contains exact actor/authority/context/revision keys, never a company-only slot.
    const keys = await page.evaluate(() =>
      Object.keys(sessionStorage).filter((x) =>
        x.startsWith("aynor.overview."),
      ),
    );
    assert.ok(
      keys.some(
        (x) =>
          x.includes(snapshot.datasetRevision) &&
          x.includes(snapshot.authorization.fingerprint),
      ),
    );
    let release;
    const gate = new Promise((r) => (release = r));
    await page.route("**/intelligence/context?*", async (route) => {
      await gate;
      await route.continue();
    });
    await page.reload();
    await expect(page.getByLabel("Loading business overview")).toBeVisible();
    await expect(revenue).toHaveCount(0);
    release();
    await expect(revenue).toContainText("55,000");
    await page.unroute("**/intelligence/context?*");
    // A cached result cannot reappear if a fresh authority check fails or is denied.
    for (const status of [503, 403]) {
      await page.route("**/intelligence/context?*", (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({ error: "Access revalidation unavailable" }),
        }),
      );
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Retry report", exact: true }),
      ).toBeVisible();
      await expect(revenue).toHaveCount(0);
      assert.equal(
        await page.evaluate(
          () =>
            Object.keys(sessionStorage).filter((x) =>
              x.startsWith("aynor.overview."),
            ).length,
        ),
        0,
      );
      await page.unroute("**/intelligence/context?*");
      await page
        .getByRole("button", { name: "Retry report", exact: true })
        .click();
      await expect(revenue).toContainText("55,000");
    }
    // Real snapshot change invalidates the old evidence token; no mismatched row positions.
    const old = snapshot.datasetRevision;
    const replacement = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Governed.xlsx",
        sheets: [
          {
            name: "Ledger",
            rows: [
              ["Transaction ID", "Date", "Revenue", "Expenses"],
              ["T1", "2026-10-01", 35000, 20000],
              ["T2", "2026-10-15", 25000, 15000],
            ],
          },
        ],
      },
    });
    assert.ok(replacement.ok(), await replacement.text());
    const stale = await page.request.get(
      w.api +
        `/intelligence/evidence?sourceId=${id}&tabId=0&metricId=finance.revenue&revision=${old}`,
    );
    assert.equal(stale.status(), 409);
    await page.reload();
    await expect(revenue).toContainText("60,000");
    const current = await (
      await page.request.get(w.api + "/intelligence?scope=" + scope)
    ).json();
    assert.notEqual(current.datasetRevision, old);
    await page.goto(
      w.base +
        `/overview?scope=${encodeURIComponent(scope)}&period=month&tag=a&tag=b&evidence=finance.revenue&source=${id}&tab=0&revision=${current.datasetRevision}`,
    );
    await expect(page.locator(".live-records")).toContainText("35000");
    await expect(page.locator(".intel-kpi")).toContainText("60,000");
    await page
      .getByRole("link", { name: "Back to overview", exact: true })
      .click();
    await expect(revenue).toContainText("60,000");
    assert.deepEqual(new URL(page.url()).searchParams.getAll("tag"), [
      "a",
      "b",
    ]);
    assert.equal(new URL(page.url()).searchParams.get("period"), "month");
    const other = await workspace(page, "Another tenant", credentials);
    await page.goto(other.base + "/overview");
    await expect(
      page.getByRole("heading", {
        name: "Connect your first spreadsheet",
        exact: true,
      }),
    ).toBeVisible();
    await expect(revenue).toHaveCount(0);
  },
);
