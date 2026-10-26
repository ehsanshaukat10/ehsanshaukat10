import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5175",
  b = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
const p = await b.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const errors = [],
  requests = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url());
});
try {
  await p.goto(base);
  await p.getByRole("button", { name: /^Skip for now/ }).click();
  await p.getByLabel("Company name", { exact: true }).fill("Fresh Start");
  await p.getByLabel("Industry").selectOption("Technology & software");
  await p
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "How does your company work?", exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Continue", exact: true }).click();
  for (let i = 0; i < 4; i++)
    await p.getByRole("button", { name: "Skip for now", exact: true }).click();
  await p.getByRole("button", { name: "Enter Aynor", exact: true }).click();
  await p.getByRole("link", { name: "Open dashboard", exact: true }).click();
  await p.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
  await expect(p.locator(".exec-chart")).toHaveCount(0);
  await expect(p.locator(".exec-risks article")).toHaveCount(0);
  await expect(p.locator(".workspace-example-label")).toHaveCount(0);
  await expect(p.locator(".exec-onboarding-tasks")).toContainText(
    "Add departments",
  );
  await expect(p.locator(".exec-onboarding-tasks")).toContainText(
    "Connect a source",
  );
  await expect(p.locator(".exec-onboarding-tasks")).toContainText(
    "Set priorities",
  );
  await expect(p.locator(".exec-onboarding-tasks")).toContainText("Add a goal");
  await expect(p.locator("#dashboard-departments")).toContainText(
    "No departments yet",
  );
  await expect(p.locator("#dashboard-goals")).toContainText("No active goals");
  await p.reload();
  await p.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
  await expect(p.locator(".exec-chart")).toHaveCount(0);
  await p
    .locator(".exec-onboarding-tasks")
    .getByRole("link", { name: /Add departments/ })
    .click();
  await p.getByRole("button", { name: "Finance", exact: true }).click();
  await p
    .getByRole("button", { name: "Save & return to overview", exact: true })
    .click();
  await p.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
  await expect(
    p
      .locator(".exec-onboarding-tasks")
      .getByRole("link", { name: /Add departments/ }),
  ).toHaveCount(0);
  await expect(p.locator("#dashboard-departments")).toContainText("Finance");
  for (const n of await p.locator(".exec-metric strong").allTextContents())
    assert.equal(n, "—");
  await p
    .locator(".exec-no-chart")
    .getByRole("link", { name: "Connect data", exact: true })
    .click();
  await p
    .getByRole("heading", {
      name: "Bring your information together.",
      exact: true,
    })
    .waitFor();
  await p.getByRole("button", { name: "Back", exact: true }).click();
  await p.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
  for (const width of [390, 768, 1920]) {
    await p.setViewportSize({ width, height: 1000 });
    assert.equal(
      await p.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(
    "PASS actual skipped onboarding → honest empty overview, refresh persistence, working recovery links, save-and-return, responsive layout and no backend requests",
  );
} finally {
  await b.close();
}
