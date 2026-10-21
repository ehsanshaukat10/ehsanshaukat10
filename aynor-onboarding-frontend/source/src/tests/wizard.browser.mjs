import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5173";
const out = "/tmp/aynor-refined-wizard";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
const errors = [],
  requests = [];
let passed = 0;
async function pageFor() {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url());
  });
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Create your account", exact: true })
    .waitFor();
  return { page, context };
}
async function signup(page, email) {
  await page.getByLabel("Full name").fill("Taylor Founder");
  await page.getByLabel("Email address").fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("A-sample-password-2026");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.getByRole("button", { name: "Verify email", exact: true }).click();
}
async function company(page, name) {
  await page
    .getByRole("link", { name: "Set up your company", exact: true })
    .click();
  await page.getByLabel("Company name").fill(name);
  await page.getByLabel("Industry").selectOption("Technology & software");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("heading", { name: "How does your company work?" })
    .waitFor();
}
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
try {
  await check(
    "authentication → welcome → five-step wizard → workspace",
    async () => {
      const { page, context } = await pageFor();
      await signup(page, "flow@prototype.example");
      await page.getByRole("heading", { name: /Let’s make room/ }).waitFor();
      await company(page, "Forma Technologies");
      assert.equal(await page.locator(".workspace-sidebar").count(), 0);
      assert.equal(await page.locator(".wizard-progress>button").count(), 5);
      assert.ok(
        await page
          .getByRole("button", { name: /Finish/ })
          .first()
          .isDisabled(),
      );
      await page.getByRole("button", { name: "Finance", exact: true }).click();
      await page
        .getByRole("button", { name: "Project Delivery", exact: true })
        .click();
      await page.screenshot({ path: out + "/structure.png", fullPage: true });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("button", { name: "Connect Google Sheets", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Deny access", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Access wasn’t granted" })
        .waitFor();
      await page
        .getByRole("button", { name: "Connect Google Sheets", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Allow sample access", exact: true })
        .click();
      await page.getByLabel("Business performance · 2026").check();
      await page.screenshot({ path: out + "/connect.png", fullPage: true });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByLabel("Invitation email 1")
        .fill("colleague@prototype.example");
      await page.getByLabel("Invitation role 1").selectOption("Executive");
      await page
        .getByRole("button", { name: "Send invitations", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Everything in its place.", exact: true })
        .waitFor();
      await page.getByText("1 pending invitation", { exact: true }).waitFor();
      await page.reload();
      await page.getByText("1 pending invitation", { exact: true }).waitFor();
      await page.screenshot({ path: out + "/finish.png", fullPage: true });
      await page
        .getByRole("button", { name: "Finish setup", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await page
        .getByRole("link", { name: "Workspace settings", exact: true })
        .first()
        .click();
      await page.getByRole("heading", { name: "Make it yours." }).waitFor();
      await page.getByRole("link", { name: /Company goals/ }).click();
      await page
        .getByRole("heading", { name: "Where are you heading?" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .waitFor();
      await context.close();
    },
  );
  await check(
    "company draft, Back/refresh persistence, future-step blocking, and resume",
    async () => {
      const { page, context } = await pageFor();
      await signup(page, "resume@prototype.example");
      await page
        .getByRole("link", { name: "Set up your company", exact: true })
        .click();
      await page.getByLabel("Company name").fill("Resume Company");
      await page.reload();
      await page.getByLabel("Company name").waitFor();
      assert.equal(
        await page.getByLabel("Company name").inputValue(),
        "Resume Company",
      );
      await page.getByLabel("Industry").selectOption("Technology & software");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Finance", exact: true }).click();
      await page.reload();
      await page
        .getByRole("heading", { name: "How does your company work?" })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Finance", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      const cid = page.url().split("/companies/")[1].split("/")[0];
      await page.goto(base + `/companies/${cid}/onboarding/finish`);
      await page
        .getByRole("heading", { name: "How does your company work?" })
        .waitFor();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      assert.equal(
        await page
          .getByRole("button", { name: "Finance", exact: true })
          .getAttribute("aria-pressed"),
        "true",
      );
      await page.goto(base + "/entry");
      await page
        .getByRole("heading", { name: "Pick up where you left off." })
        .waitFor();
      await page
        .getByRole("link", { name: "Resume setup", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "How does your company work?" })
        .waitFor();
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("aynor.frontend-prototype.v1")),
      );
      assert.equal(
        stored.companies.filter((c) => c.name === "Resume Company").length,
        1,
      );
      await context.close();
    },
  );
  await check(
    "optional steps skip cleanly and completed login enters workspace directly",
    async () => {
      const { page, context } = await pageFor();
      await signup(page, "skip@prototype.example");
      await company(page, "Fast Start");
      for (let i = 0; i < 3; i++)
        await page
          .getByRole("button", { name: "Skip for now", exact: true })
          .click();
      await page
        .getByRole("heading", { name: "Everything in its place." })
        .waitFor();
      await page
        .getByRole("button", { name: "Finish setup", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      const url = page.url();
      await page.goto(base + "/auth/login");
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      assert.equal(page.url(), url);
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("aynor.frontend-prototype.v1")),
      );
      const c = stored.companies.find((c) => c.name === "Fast Start");
      assert.equal(c.data.wizard.steps.connect, "skipped");
      assert.equal(c.data.wizard.steps.team, "skipped");
      assert.equal(c.data.completed, true);
      await context.close();
    },
  );
  await check(
    "mobile wizard has no sidebar, extra navigator, or horizontal overflow",
    async () => {
      const { page, context } = await pageFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await signup(page, "mobile@prototype.example");
      await company(page, "Mobile Company");
      await page.screenshot({ path: out + "/mobile.png", fullPage: true });
      assert.equal(
        await page
          .locator(".workspace-sidebar,.flow-navigator,.setup-nav")
          .count(),
        0,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page
        .getByRole("button", { name: "Skip for now", exact: true })
        .click();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await context.close();
    },
  );

  await check(
    "pending invitation joins its company without creating a company",
    async () => {
      const { page, context } = await pageFor();
      await page.goto(base + "/invite/prototype-invitation");
      await page.getByRole("link", { name: "Get started" }).click();
      await signup(page, "guest@aynor.example");
      await page.getByRole("heading", { name: "You’re invited." }).waitFor();
      assert.equal(
        await page.getByRole("link", { name: "Set up your company" }).count(),
        0,
      );
      await page
        .getByRole("button", { name: "Accept invitation", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await context.close();
    },
  );
  await check(
    "multi-company selection and switching preserve roles",
    async () => {
      const { page, context } = await pageFor();
      await page.getByRole("button", { name: /Explore the prototype/ }).click();
      await page.getByRole("heading", { name: "Your companies." }).waitFor();
      const card = page
        .locator(".company-card")
        .filter({ hasText: "Vordx Technologies" });
      await card.getByRole("link", { name: "Open workspace" }).click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await page
        .getByRole("button", { name: /Vordx Technologies Owner/ })
        .click();
      await page.getByRole("link", { name: /Northstar Studio Viewer/ }).click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await page
        .getByRole("button", { name: /Northstar Studio Viewer/ })
        .waitFor();
      assert.equal(
        await page
          .getByRole("link", { name: "Workspace settings", exact: true })
          .count(),
        0,
      );
      await context.close();
    },
  );
  await check(
    "partial invitation results are recoverable without duplicate sending",
    async () => {
      const { page, context } = await pageFor();
      await signup(page, "partial@prototype.example");
      await company(page, "Partial Invite Company");
      await page
        .getByRole("button", { name: "Skip for now", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Skip for now", exact: true })
        .click();
      await page
        .getByLabel("Invitation email 1")
        .fill("same@prototype.example");
      await page.getByLabel("Invitation role 1").selectOption("Executive");
      await page
        .getByRole("button", { name: "Add another person", exact: true })
        .click();
      await page
        .getByLabel("Invitation email 2")
        .fill("same@prototype.example");
      await page.getByLabel("Invitation role 2").selectOption("Executive");
      await page
        .getByRole("button", { name: "Send invitations", exact: true })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "already pending" })
        .waitFor();
      await page.getByLabel("Invitation email 1").fill("");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("heading", { name: "Everything in its place." })
        .waitFor();
      await page.getByText("1 pending invitation", { exact: true }).waitFor();
      const state = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("aynor.frontend-prototype.v1")),
      );
      assert.equal(
        state.invitations.filter(
          (i) => i.email === "same@prototype.example" && i.status === "pending",
        ).length,
        1,
      );
      await context.close();
    },
  );

  await check(
    "post-onboarding company, department, source, and metric editors remain available",
    async () => {
      const { page, context } = await pageFor();
      await page.getByRole("button", { name: /Explore the prototype/ }).click();
      await page.getByRole("heading", { name: "Your companies." }).waitFor();
      await page
        .locator(".company-card")
        .filter({ hasText: "Vordx Technologies" })
        .getByRole("link", { name: "Open workspace" })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await page
        .getByRole("link", { name: "Workspace settings", exact: true })
        .first()
        .click();
      await page.getByRole("link", { name: /Company profile/ }).click();
      await page.getByLabel("Company name").fill("Vordx Updated");
      await page
        .getByRole("button", { name: "Save company details", exact: true })
        .click();
      await page.getByRole("heading", { name: "Make it yours." }).waitFor();
      await page.getByRole("link", { name: /Departments/ }).click();
      await page.getByLabel("Custom department").fill("Customer Success");
      await page
        .getByRole("button", { name: "Add department", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeEnabled();
      assert.equal(await page.getByRole("alert").count(), 0);
      await page
        .getByRole("link", { name: "Workspace settings", exact: true })
        .first()
        .click();
      await page.getByRole("link", { name: /Data connections/ }).click();
      await page
        .getByRole("button", { name: "Explore with sample data", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeEnabled();
      assert.equal(await page.getByRole("alert").count(), 0);
      await page
        .getByRole("link", { name: "Select spreadsheets", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Select Business performance · 2026",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Save changes", exact: true }),
      ).toBeEnabled();
      assert.equal(await page.getByRole("alert").count(), 0);
      await page
        .getByRole("link", { name: "Workspace settings", exact: true })
        .first()
        .click();
      await page.getByRole("link", { name: /Performance metrics/ }).click();
      await page
        .getByRole("heading", { name: "Measure what matters." })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Continue", exact: true })
          .count(),
        0,
      );
      await context.close();
    },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(`${passed} wizard journeys passed; zero backend requests.`);
} finally {
  await browser.close();
}
