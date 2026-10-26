import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5175",
  b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
const p = await b.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  }),
  errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("dialog", (d) => d.accept());
const root = "/companies/preview-workspace",
  go = async (path) => {
    await p.goto(base + root + path);
    await p.locator(".intel-page h1").waitFor();
  };
try {
  await p.goto(base + "/prototype");
  await p
    .getByRole("button", {
      name: "Open Workspace overview screen",
      exact: true,
    })
    .click();
  await p.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
  await go("/departments?state=workspace");
  await expect(p.locator(".intel-matrix")).toContainText("Limited data");
  await go("/departments/Marketing");
  await expect(p.locator(".intel-page")).toContainText(
    "No supported metrics mapped",
  );
  await go("/dependencies?type=Products");
  await expect(p.locator(".intel-page")).toContainText(
    "Product identifiers are not present",
  );
  await go("/dependencies/missing-entity");
  await expect(p.locator(".intel-page")).toContainText(
    "This entity is not available",
  );
  await go("/departments/%25");
  await expect(p.locator(".intel-page")).toContainText(
    "Department unavailable",
  );
  console.log(
    "PASS missing/unmapped/unsupported/deleted entities have honest recovery states",
  );
  await go("/actions/resource?write=error");
  await p
    .getByRole("button", { name: "Accept recommendation", exact: true })
    .click();
  await expect(p.getByRole("alert")).toContainText("Couldn't save");
  await expect(p.locator(".intel-action-state")).toContainText("Recommended");
  await p
    .getByRole("button", { name: "Retry status update", exact: true })
    .click();
  await expect(p.locator(".intel-action-state")).toContainText("Accepted");
  await go("/actions/resource?state=workspace");
  await expect(p.locator(".intel-notice.warning")).toContainText(
    "Supporting source records are unavailable",
  );
  await p
    .getByRole("button", { name: "Dismiss recommendation", exact: true })
    .click();
  await p
    .getByLabel("Reason (optional)")
    .fill("Review after the next source update.");
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Dismiss recommendation", exact: true })
    .click();
  await expect(p.locator(".intel-action-state")).toContainText("Dismissed");
  await p.reload();
  await expect(p.locator(".intel-page")).toContainText(
    "Review after the next source update.",
  );
  console.log(
    "PASS failed decision save/retry, missing source snapshot, dismissal reason and persistence",
  );
  await go("/goals/new?state=workspace");
  await p.getByLabel("Goal title", { exact: true }).fill("A retained draft");
  await p.getByLabel("Target", { exact: true }).fill("-1");
  assert.equal(
    await p
      .getByLabel("Target", { exact: true })
      .evaluate((e) => e.checkValidity()),
    false,
  );
  await p
    .locator(".primary-nav")
    .getByRole("link", { name: "Departments", exact: true })
    .click();
  await go("/goals/new?state=workspace");
  await expect(p.getByLabel("Goal title", { exact: true })).toHaveValue(
    "A retained draft",
  );
  await p.getByRole("button", { name: "Discard draft", exact: true }).click();
  await p
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(p.getByLabel("Goal title", { exact: true })).toHaveValue("");
  console.log(
    "PASS goal validation, draft restoration and explicit discard confirmation",
  );
  await go("/ask?response=error&question=What%20needs%20my%20attention%3F");
  await p.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(p.getByRole("alert")).toContainText("Couldn't prepare");
  await p.getByRole("button", { name: "Retry question", exact: true }).click();
  await expect(p.locator(".intel-answer")).toContainText("issues");
  await go("/ask?state=workspace&question=Why%20did%20expenses%20rise%3F");
  await p.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(p.locator(".intel-answer")).toContainText(
    "no validated performance records",
  );
  await go("/ask?response=unavailable&question=Explain%20revenue");
  await p.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(p.locator(".intel-answer")).toContainText(
    "source is unavailable",
  );
  console.log(
    "PASS assistant failure/retry, no-data and unavailable-source responses without fabricated conclusions",
  );
  await go("/settings/connections?sync=expired");
  await expect(p.locator(".intel-source").first()).toContainText(
    "Permission expired",
  );
  await p
    .locator(".intel-source")
    .first()
    .getByRole("button", { name: "Reconnect", exact: true })
    .click();
  await p
    .getByRole("button", { name: "Reconnect example", exact: true })
    .click();
  await expect(p.locator(".intel-source").first()).toContainText("Configured");
  await go("/settings/connections?sync=error");
  await p
    .locator(".intel-source")
    .nth(1)
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await expect(p.getByRole("alert")).toContainText("Couldn't refresh");
  await p
    .locator(".intel-source")
    .nth(1)
    .getByRole("button", { name: "Retry refresh", exact: true })
    .click();
  await expect(p.locator(".intel-source").nth(1)).toContainText(
    "Mapping incomplete",
  );
  console.log(
    "PASS expired access, local reconnect, refresh failure/retry and incomplete-mapping state",
  );
  await p.goto(base + "/companies/northstar/departments");
  await p.getByRole("heading", { name: "Departments.", exact: true }).waitFor();
  await expect(p.locator(".intel-page")).not.toContainText("Finance");
  await p.goto(base + "/companies/northstar/departments/Finance/metrics/costs");
  await expect(p.locator(".intel-page")).toContainText(
    "Department unavailable",
  );
  await p.goto(base + "/companies/northstar/goals/new");
  await expect(p.locator(".intel-page")).toContainText(
    "Administrator access required",
  );
  await p.goto(base + "/companies/northstar/settings/profile");
  await expect(p.locator(".intel-page")).toContainText(
    "Administrator access required",
  );
  await p.goto(
    base +
      "/companies/northstar/ask?state=connected&question=Why%20did%20expenses%20rise%3F",
  );
  await p.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(p.locator(".intel-answer")).toContainText(
    "not available in the covered department scope",
  );
  console.log(
    "PASS scoped routes, readonly controls, company isolation and financial answer restrictions",
  );
  assert.deepEqual(errors, []);
} finally {
  await b.close();
}
