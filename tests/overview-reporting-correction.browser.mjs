import fs from "node:fs";
import {
  scenario,
  workspace,
  expect,
  assert,
  origin,
} from "./fixtures/feedback-browser.mjs";

const artifacts =
  process.env.AYNOR_OVERVIEW_ARTIFACTS ||
  "/tmp/aynor-overview-reporting-correction";
fs.mkdirSync(artifacts, { recursive: true });
async function isolatedWorkspace(page, name, slug) {
  const credentials = {
    email: `${slug}@example.test`,
    password: `${slug}-password-long-enough`,
  };
  assert.equal(
    (
      await page.request.post(origin + "/api/auth/signup", {
        data: { ...credentials, name },
      })
    ).status(),
    201,
  );
  await page.request.post(origin + "/api/__fixture/confirm-email", {
    data: { email: credentials.email },
  });
  return workspace(page, name, credentials);
}

await scenario(
  "Overview stops failed refreshes and reports the missing intelligence setup precisely",
  async (page) => {
    const w = await isolatedWorkspace(
      page,
      "Panther setup regression",
      "panther-setup-regression",
    );
    let requests = 0;
    await page.route("**/intelligence/context?*", async (route) => {
      requests++;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            "Business intelligence setup is incomplete. Apply the pending AYNOR intelligence-read migration.",
        }),
      });
    });
    await page.goto(w.base + "/overview");
    await expect(page.getByRole("alert")).toContainText(
      "reporting database update has not been installed",
    );
    await expect(
      page.getByText("Updating report…", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".concise-overview")).toHaveAttribute(
      "aria-busy",
      "false",
    );
    await page.screenshot({
      path: artifacts + "/database-setup-actionable.png",
      fullPage: true,
    });
    const settledRequests = requests;
    await page.waitForTimeout(16000);
    assert.equal(
      requests,
      settledRequests,
      "a failed report must not retry every 15 seconds",
    );
    await page.getByRole("button", { name: "Retry report" }).click();
    await expect.poll(() => requests).toBe(settledRequests + 1);
  },
);

await scenario(
  "a connected table with no validated measure receives a specific resolution instead of review/null",
  async (page) => {
    const w = await isolatedWorkspace(
      page,
      "Panther empty-report regression",
      "panther-empty-report-regression",
    );
    const added = await page.request.post(w.sources, {
      data: {
        mode: "upload",
        name: "Customer notes.csv",
        sheets: [
          {
            name: "Notes",
            rows: [
              ["Customer", "Comment"],
              ["Acme", "Follow up next week"],
            ],
          },
        ],
      },
    });
    assert.ok(added.ok());
    const sourceId = (await added.json()).selectedId;
    assert.ok(
      (
        await page.request.post(w.sources + `/${sourceId}/prepare`, {
          data: { allowAi: false },
        })
      ).ok(),
    );
    const response = await page.request.get(w.sources + "/intelligence");
    assert.ok(response.ok());
    const report = (await response.json()).executive;
    assert.equal(report.state, "review");
    assert.notEqual(report.dataStatus, null);
    assert.ok(report.resolution.reasons.length > 0);
    await page.goto(w.base + "/overview");
    await expect(
      page.getByRole("heading", { name: report.resolution.title, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Reporting issues")).toBeVisible();
    await expect(
      page.getByRole("link", { name: report.resolution.actionLabel }),
    ).toHaveAttribute("href", /connections/);
    await page.screenshot({
      path: artifacts + "/unsupported-data-actionable.png",
      fullPage: true,
    });
  },
);
