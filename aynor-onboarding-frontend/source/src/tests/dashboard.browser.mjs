import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5174";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [],
  requests = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url());
});
const heading = () =>
  page.getByRole("heading", { name: "Overview.", exact: true }).waitFor();
const preview = async (value) => {
  const url = new URL(page.url());
  url.searchParams.set("state", value);
  url.hash = "";
  await page.goto(url.toString());
  await heading();
};
const close = () =>
  page.getByRole("button", { name: "Close", exact: true }).click();
async function customize() {
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page
    .getByRole("heading", { name: "Make this overview yours" })
    .waitFor();
}
async function seedChange(fn) {
  await page.evaluate(fn);
  await page.reload();
  await heading();
}
try {
  await page.goto(base + "/prototype");
  await page
    .getByRole("button", {
      name: "Open Workspace overview screen",
      exact: true,
    })
    .click();
  await heading();
  const path = new URL(page.url()).pathname;
  await page
    .getByRole("button", { name: "Search or Ask Aynor", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill("Why did costs increase?");
  await page
    .getByRole("button", {
      name: "Ask Aynor: Why did costs increase?",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Local simulated analysis",
  );
  await expect(page.getByLabel("Your question")).toHaveValue(
    "Why did costs increase?",
  );
  await page.keyboard.press("Control+k");
  assert.equal(await page.getByRole("dialog").count(), 1);
  await close();
  await page
    .locator(".primary-nav")
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toContainText("Search your workspace");
  await page
    .getByRole("textbox", { name: "Search", exact: true })
    .fill("Departments");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Departments Go to", exact: true })
    .click();
  await expect(page.locator(".primary-nav .active")).toHaveText("Departments");
  await page
    .locator(".primary-nav")
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Workspace notifications", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Field mappings need review",
  );
  await close();
  const statusSegments = page.locator(".exec-delivery-distribution button");
  assert.equal(await statusSegments.count(), 3);
  await statusSegments.first().click();
  await expect(page.getByRole("dialog")).toContainText("Platform handover");
  await close();
  console.log(
    "PASS global search, contextual question handoff, notifications and delivery status drilldowns",
  );

  assert.equal(
    await page.getByLabel("Data preview", { exact: true }).count(),
    0,
  );
  assert.equal(await page.locator(".prototype-tools").count(), 0);
  assert.equal(
    await page.locator(".exec-context,.exec-summary-actions").count(),
    0,
  );
  assert.equal(await page.locator(".workspace-example-label").count(), 1);
  assert.equal(
    await page.locator("#dashboard-activity,#dashboard-clients").count(),
    0,
  );
  assert.deepEqual(
    (await page.locator(".primary-nav a").allTextContents()).map((t) =>
      t.trim(),
    ),
    [
      " Overview",
      "Departments",
      "Dependencies",
      "Goals",
      "Actions",
      "Ask Aynor",
    ].map((t) => t.trim()),
  );
  await expect(page.locator(".exec-chart")).toBeVisible();
  assert.equal(await page.locator(".exec-metric strong").count(), 3);
  await page.getByRole("button", { name: "Open profile" }).click();
  await expect(page.getByRole("dialog")).toContainText("Alex Morgan");
  await close();
  for (const label of ["Departments", "Dependencies", "Goals", "Actions"]) {
    await page
      .locator(".primary-nav")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(
      page
        .locator(".primary-nav")
        .getByRole("link", { name: label, exact: true }),
    ).toHaveClass("active");
    const target = await page.evaluate(() =>
      document.querySelector(".primary-nav .active")?.getAttribute("href"),
    );
    assert.ok(target.includes("#"));
    assert.equal(await page.locator(".primary-nav .active").count(), 1);
  }
  for (let i = 0; i < 2; i++) {
    await page
      .locator(".primary-nav")
      .getByRole("link", { name: "Ask Aynor", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "Local simulated analysis",
    );
    await close();
  }
  await page
    .locator(".primary-nav")
    .getByRole("link", { name: "Overview", exact: true })
    .click();
  await preview("workspace");
  console.log(
    "PASS populated default, header profile and all dashboard navigation links",
  );
  await expect(page.locator(".exec-quality")).toContainText(
    "Awaiting validated data",
  );
  assert.equal(await page.locator(".exec-risks article").count(), 0);
  await expect(page.locator(".exec-no-chart")).toBeVisible();
  for (const value of await page
    .locator(".exec-metric strong")
    .allTextContents())
    assert.equal(value, "—");
  console.log("PASS honest workspace baseline");
  await preview("connected");
  const departmentPanel = page.locator("#dashboard-departments");
  assert.equal(
    await departmentPanel.locator(".exec-matrix-head span").count(),
    4,
  );
  assert.ok((await departmentPanel.locator(".exec-matrix-row").count()) > 0);
  await departmentPanel.locator(".exec-matrix-row").first().click();
  await expect(page.getByRole("dialog")).toContainText("Operating costs");
  await close();
  assert.equal(
    await page.locator(".exec-chart-scale span").last().textContent(),
    "0",
  );
  assert.equal(
    await page.locator(".exec-chart-scale span").first().textContent(),
    "50K",
  );
  for (const tooltip of await page
    .locator(".exec-chart svg g title")
    .allTextContents()) {
    assert.ok(
      tooltip.includes("Revenue") && tooltip.includes("Operating costs"),
    );
  }
  const plot = page.locator(".exec-chart svg");
  const bounds = await plot.boundingBox();
  await page.mouse.move(
    bounds.x + bounds.width * 0.95,
    bounds.y + bounds.height * 0.5,
  );
  await expect(
    page.locator(".exec-chart-points button").last(),
  ).toHaveAttribute("aria-pressed", "true");
  console.log(
    "PASS department matrix drilldown and pointer-follow chart selection",
  );
  assert.equal(await page.locator(".exec-risks article").count(), 3);
  await expect(page.locator(".workspace-example-label")).toHaveText("Demo");
  assert.equal(await page.locator(".exec-chart-points button").count(), 3);
  await page.locator(".exec-chart-points button").nth(1).focus();
  await expect(page.locator(".exec-chart-reading")).toContainText(
    await page.locator(".exec-chart-points button").nth(1).innerText(),
  );
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toContainText("Expenses: people");
  await page
    .getByRole("button", { name: "Ask Aynor why", exact: true })
    .click();
  await expect(page.getByLabel("Your question")).not.toHaveValue("");
  await page.getByRole("button", { name: "Ask about this overview" }).click();
  await expect(page.locator(".exec-answer")).toContainText("Regarding");
  await close();
  await page.getByRole("button", { name: "Trend", exact: true }).click();
  assert.equal(await page.locator(".exec-chart svg polyline").count(), 2);
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  assert.equal(await page.locator(".exec-chart svg g rect").count(), 6);
  await page
    .getByLabel("Reporting period", { exact: true })
    .selectOption("year");
  assert.equal(await page.locator(".exec-chart-points button").count(), 12);
  await page.locator(".exec-table summary").click();
  assert.equal(await page.locator(".exec-table tbody tr").count(), 12);
  console.log(
    "PASS chart keyboard exploration, expenses, contextual analysis and reporting periods",
  );
  await customize();
  await page.getByLabel("Business lens").selectOption("managed");
  await page.getByLabel("Client concentration", { exact: true }).check();
  await page.getByLabel("Activity patterns", { exact: true }).check();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.locator(".exec-metrics")).toContainText("SLA compliance");
  await expect(page.locator(".exec-metrics")).toContainText("SLA compliance");
  await page.reload();
  await heading();
  await expect(
    page.getByLabel("Reporting period", { exact: true }),
  ).toHaveValue("year");
  await expect(page.locator(".exec-metrics")).toContainText("SLA compliance");
  await preview("connected");
  await page.getByRole("button", { name: /Orion Group\s*37%/ }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Infrastructure renewal",
  );
  await close();
  assert.equal(await page.locator(".exec-activity button").count(), 14);
  console.log(
    "PASS company preferences persist and optional client/activity drilldowns",
  );
  await page.locator(".exec-risks .exec-text-button").first().click();
  await page
    .getByLabel("Decision / next action")
    .fill("Alex to confirm the delivery owner by Friday.");
  await page.getByRole("button", { name: "Save decision locally" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Saved in this browser: Alex",
  );
  await close();
  await page.reload();
  await heading();
  await preview("connected");
  await page.locator(".exec-risks .exec-text-button").first().click();
  await expect(page.getByLabel("Decision / next action")).toHaveValue(
    "Alex to confirm the delivery owner by Friday.",
  );
  await close();
  console.log("PASS local decision records survive refresh");
  await preview("partial");
  await expect(page.locator(".exec-quality")).toContainText(
    "Partial example coverage",
  );
  await expect(page.locator(".exec-secondary")).toContainText("No data");
  await preview("stale");
  await expect(page.locator(".exec-quality")).toContainText("12 days old");
  await preview("sync-error");
  await page.getByRole("button", { name: "Retry example sync" }).click();
  await expect(page.locator(".exec-quality")).toHaveCount(0);
  await preview("clear");
  assert.equal(await page.locator(".exec-risks article").count(), 0);
  await expect(page.locator(".exec-action")).toContainText(
    "No critical issues",
  );
  await customize();
  for (const s of [
    "Department intelligence",
    "Goals",
    "Dependencies",
    "Upcoming deadlines",
    "Client concentration",
    "Activity patterns",
  ])
    await page.getByRole("checkbox", { name: s, exact: true }).uncheck();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await preview("sync-error");
  await expect(page.locator(".exec-quality")).toBeVisible();
  await expect(page.locator(".exec-toolbar")).toBeVisible();
  assert.equal(await page.locator(".exec-risks article").count(), 3);
  assert.equal(await page.locator(".exec-secondary .exec-panel").count(), 0);
  console.log(
    "PASS partial/stale/error/retry/clear states and mandatory context",
  );
  await customize();
  await page.getByRole("button", { name: "Balanced", exact: true }).click();
  await page.getByRole("button", { name: "Save preferences" }).click();
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({
      path: `/tmp/aynor-dashboard-${width}.png`,
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `Horizontal overflow at ${width}`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log("PASS desktop/tablet/mobile overflow checks");
  await seedChange(() => {
    const k = "aynor.frontend-prototype.v1",
      s = JSON.parse(localStorage.getItem(k));
    const c = s.companies.find((c) => c.id === "preview-workspace");
    c.data.departments = ["Finance", "Sales", "Operations"];
    c.data.goals = [];
    localStorage.setItem(k, JSON.stringify(s));
  });
  await preview("connected");
  assert.equal(
    await page
      .locator(".exec-secondary .exec-panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Department intelligence",
          exact: true,
        }),
      })
      .locator(".exec-row")
      .count(),
    3,
  );
  await preview("workspace");
  await expect(page.locator(".exec-secondary")).toContainText(
    "No active goals",
  );
  await seedChange(() => {
    const k = "aynor.frontend-prototype.v1",
      s = JSON.parse(localStorage.getItem(k));
    const c = s.companies.find((c) => c.id === "preview-workspace");
    c.data.departments = [
      "Finance",
      "Sales",
      "Operations",
      "Human Resources",
      "Marketing",
      "Engineering",
      "Support",
      "Customer Success",
      "Product",
      "Legal",
    ];
    localStorage.setItem(k, JSON.stringify(s));
  });
  await preview("connected");
  assert.equal(
    await page
      .locator(".exec-secondary .exec-panel")
      .filter({
        has: page.getByRole("heading", {
          name: "Department intelligence",
          exact: true,
        }),
      })
      .locator(".exec-row")
      .count(),
    10,
  );
  console.log("PASS three/ten departments and no goals");
  await page.goto(base + "/companies/northstar/overview");
  await heading();
  await preview("connected");
  await expect(
    page.getByRole("heading", { name: "Delivery performance", exact: true }),
  ).toBeVisible();
  assert.equal(
    await page
      .getByRole("heading", { name: "Revenue & operating costs" })
      .count(),
    0,
  );
  await expect(page.locator(".exec-metrics")).not.toContainText("receivables");
  assert.equal(
    await page
      .locator(".exec-risks")
      .getByText("Finance", { exact: true })
      .count(),
    0,
  );
  await expect(
    page.getByLabel("Reporting period", { exact: true }),
  ).toHaveValue("quarter");
  console.log("PASS company isolation and restricted department scope");
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log("PASS no browser errors or backend network requests");
} finally {
  await browser.close();
}
