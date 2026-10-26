import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5175",
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  }),
  page = await context.newPage(),
  errors = [],
  requests = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url());
});
page.on("dialog", (d) => d.accept());
const routePath = (url) => {
  const parsed = new URL(url);
  return base.includes("#")
    ? parsed.hash.slice(1).split("?")[0]
    : parsed.pathname;
};
const root = "/companies/preview-workspace",
  heading = (name) =>
    page.getByRole("heading", { name, exact: true }).waitFor(),
  go = async (path) => {
    await page.goto(base + root + path);
    await page.locator(".intel-page h1,.exec-dashboard h1").waitFor();
  },
  back = () => page.locator(".intel-back").click();
try {
  await page.goto(base + "/prototype");
  await page
    .getByRole("button", {
      name: "Open Workspace overview screen",
      exact: true,
    })
    .click();
  await heading("Overview.");
  await page
    .getByRole("button", { name: "Review delivery plan", exact: true })
    .click();
  await page.getByRole("link", { name: "Open action", exact: true }).click();
  await heading("Atlas migration crossed its deadline.");
  await expect(
    page.getByRole("heading", { name: "What is the evidence?", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Accept recommendation", exact: true })
    .click();
  await expect(page.locator(".intel-action-state")).toContainText("Accepted");
  await page
    .getByRole("button", { name: "Mark in progress", exact: true })
    .click();
  await expect(page.locator(".intel-action-state")).toContainText(
    "In Progress",
  );
  await page
    .getByRole("button", { name: "Mark completed", exact: true })
    .click();
  await expect(page.locator(".intel-action-state")).toContainText("Completed");
  await back();
  await heading("Overview.");
  await expect(page.locator(".exec-risks")).toContainText("Completed");
  console.log(
    "PASS 1 executive issue → evidence → accept → progress → complete → Overview",
  );
  await page
    .locator(".primary-nav")
    .getByRole("link", { name: "Departments", exact: true })
    .click();
  await heading("Departments.");
  await page
    .getByRole("button", { name: "Needs attention", exact: true })
    .click();
  await page
    .locator(".intel-matrix-row")
    .getByRole("link", { name: "Finance", exact: true })
    .click();
  await heading("Finance.");
  await page
    .locator(".intel-kpi")
    .filter({
      has: page.locator("span").filter({ hasText: /^Operating expenses$/ }),
    })
    .click();
  await heading("Operating expenses.");
  await expect(page.locator(".exec-chart")).toBeVisible();
  await page
    .getByRole("link", { name: "Ask Aynor", exact: true })
    .last()
    .click();
  await heading("Ask Aynor.");
  await expect(page.getByLabel("Your question", { exact: true })).toHaveValue(
    /Explain/,
  );
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".intel-answer")).toContainText(
    "operating expenses",
  );
  await back();
  await heading("Operating expenses.");
  await back();
  await heading("Finance.");
  await back();
  await heading("Departments.");
  await expect(
    page.getByRole("button", { name: "Needs attention", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  console.log(
    "PASS 2 department → metric → historical comparison → contextual assistant → context-preserving return",
  );
  await go("/dependencies?type=Projects&view=Graph&zoom=1.2&q=Atlas");
  await page.getByRole("link", { name: /Project.*Atlas migration/ }).click();
  await heading("Atlas migration.");
  await page.getByRole("link", { name: "Sana Ahmed", exact: true }).click();
  await heading("Sana Ahmed.");
  await page
    .getByRole("link", {
      name: "One specialist is committed to two priority projects",
      exact: false,
    })
    .click();
  await heading("One specialist is committed to two priority projects.");
  await back();
  await heading("Sana Ahmed.");
  await back();
  await heading("Atlas migration.");
  await back();
  await heading("Dependencies.");
  await expect(page.getByLabel("Search entities")).toHaveValue("Atlas");
  await expect(page.getByLabel("Entity type")).toHaveValue("Projects");
  await expect(page.locator(".intel-zoom")).toContainText("120%");
  console.log(
    "PASS 3 dependency → project → resource → risk → graph filter/zoom restoration",
  );
  await go("/goals");
  await page.getByRole("link", { name: "Create goal", exact: true }).click();
  await heading("Create goal.");
  await page
    .getByLabel("Goal title", { exact: true })
    .fill("Reduce support backlog");
  await page.getByLabel("Tracking method").selectOption("Manual");
  await page.getByLabel("Measure name").fill("Open backlog");
  await page.getByLabel("Target", { exact: true }).fill("10");
  await page.getByLabel("Starting value (optional)").fill("40");
  await page.getByLabel("Target direction").selectOption("Decrease");
  await page.getByLabel("Deadline", { exact: true }).fill("2027-04-30");
  await page.getByRole("button", { name: "Save goal", exact: true }).click();
  await heading("Reduce support backlog.");
  await page.getByLabel("Actual value").fill("25");
  await page
    .getByRole("button", { name: "Update progress", exact: true })
    .click();
  await expect(page.locator(".intel-goal-hero")).toContainText("25");
  await page.getByLabel("Actual value").fill("8");
  await page
    .getByRole("button", { name: "Update progress", exact: true })
    .click();
  await expect(page.locator(".intel-goal-hero")).toContainText("Achieved");
  await expect(page.locator(".intel-series")).toBeVisible();
  await page.reload();
  await heading("Reduce support backlog.");
  await expect(page.locator(".intel-goal-hero")).toContainText("8");
  await page.getByRole("button", { name: "Pause goal", exact: true }).click();
  await expect(page.locator(".intel-goal-hero")).toContainText("Paused");
  await page.getByRole("button", { name: "Resume goal", exact: true }).click();
  console.log(
    "PASS 4 create manual goal → target/direction → saved detail → real progress history → achieved → pause/resume",
  );
  await go(
    "/ask?question=Why%20did%20expenses%20change%3F&context=Finance&period=quarter",
  );
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.locator(".intel-answer")).toContainText("Margin");
  const convo = routePath(page.url());
  await page
    .getByRole("link", { name: "Open expense metric", exact: true })
    .click();
  await heading("Operating expenses.");
  await back();
  await heading("Ask Aynor.");
  assert.equal(routePath(page.url()), convo);
  await expect(page.locator(".intel-answer")).toContainText(
    "Why did expenses change?",
  );
  console.log(
    "PASS 5 assistant → evidence-backed calculation → source metric → same conversation",
  );
  await go("/overview?state=sync-error");
  await page
    .locator(".exec-quality")
    .getByRole("button", { name: /Details/ })
    .click();
  await page
    .getByRole("link", { name: "Open data connections", exact: true })
    .click();
  await heading("Company settings.");
  await expect(page.locator(".intel-source")).toHaveCount(3);
  await page
    .locator(".intel-source")
    .first()
    .getByRole("button", { name: "Reconnect", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Reconnect example", exact: true })
    .click();
  await page
    .locator(".intel-source")
    .first()
    .getByRole("link", { name: "Review mapping", exact: true })
    .click();
  await heading("Give your data meaning.");
  for (const label of await page.getByRole("checkbox").all()) {
    if (!(await label.isChecked())) await label.check();
  }
  let next = page.getByRole("button", { name: "Next field", exact: true });
  while (await next.isVisible().catch(() => false)) {
    await next.click();
    for (const box of await page.getByRole("checkbox").all()) {
      if (!(await box.isChecked())) await box.check();
    }
    if (await next.isDisabled().catch(() => true)) break;
  }
  await page
    .getByRole("button", { name: "Save & return to settings", exact: true })
    .click();
  await heading("Company settings.");
  await page
    .locator(".intel-source")
    .first()
    .getByRole("button", { name: "Refresh", exact: true })
    .click();
  await expect(page.locator(".intel-source").first()).toContainText("Synced");
  await page.getByRole("link", { name: "Back", exact: true }).click();
  await heading("Overview.");
  console.log(
    "PASS 6 data warning → connections → reconnect → refresh → original Overview",
  );
  await go("/actions?filter=Completed");
  await expect(page.locator(".intel-panel")).toContainText("Atlas migration");
  await page.getByRole("link", { name: /Atlas migration crossed/ }).click();
  await expect(page.locator(".intel-action-state")).toContainText("Completed");
  await page
    .getByRole("button", { name: "Reopen decision", exact: true })
    .click();
  await expect(page.locator(".intel-action-state")).toContainText("Accepted");
  const returningPath = page.url();
  await page.evaluate(() =>
    sessionStorage.removeItem("aynor.prototype-persona"),
  );
  await page.reload();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await heading("Welcome back.");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("alex@aynor.example");
  await page.getByLabel("Password", { exact: true }).fill("previewpassword123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".intel-action-state")).toContainText("Accepted");
  assert.equal(routePath(page.url()), routePath(returningPath));
  console.log(
    "PASS 7 returning session retains company, reporting context and prior decisions",
  );
  for (const [path, title] of [
    ["/departments", "Departments."],
    ["/dependencies", "Dependencies."],
    ["/goals", "Goals."],
    ["/actions", "Actions."],
    ["/ask", "Ask Aynor."],
    ["/settings/profile", "Company settings."],
  ]) {
    await go(path);
    await heading(title);
    for (const width of [390, 768, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        false,
        `${path} overflow ${width}`,
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(
    "PASS all six modules responsive, zero runtime errors and zero backend requests",
  );
} finally {
  await browser.close();
}
