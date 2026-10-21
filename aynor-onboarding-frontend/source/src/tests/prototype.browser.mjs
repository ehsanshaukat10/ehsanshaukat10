import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5173";
const output = "/tmp/aynor-frontend-preview";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
let passed = 0;
const errors = [];
const apiRequests = [];
async function pageFor(width = 1440, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      apiRequests.push(r.url());
  });
  await page.goto(base + "/welcome");
  await page
    .getByRole("heading", { name: "Create your account", exact: true })
    .waitFor();
  return { page, context };
}
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
try {
  await check(
    "reference-based desktop, tablet, and mobile layouts",
    async () => {
      for (const [width, height, name] of [
        [1440, 1000, "desktop"],
        [1024, 768, "tablet"],
        [390, 844, "mobile"],
      ]) {
        const { page, context } = await pageFor(width, height);
        await page.screenshot({
          path: `${output}/signup-${name}.png`,
          fullPage: true,
        });
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          name + " must not overflow",
        );
        await context.close();
      }
    },
  );
  await check(
    "simulated Google authentication and multiple company roles",
    async () => {
      const { page, context } = await pageFor();
      await page
        .getByRole("button", { name: "Continue with Google", exact: true })
        .click();
      await page.getByRole("button", { name: /Alex Morgan/ }).click();
      await page.getByRole("heading", { name: "Your companies." }).waitFor();
      await page.getByText("Vordx Technologies", { exact: true }).waitFor();
      await page.screenshot({
        path: `${output}/companies-desktop.png`,
        fullPage: true,
      });
      await page.getByRole("link", { name: "Open workspace" }).nth(1).click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await context.close();
    },
  );
  await check(
    "new company, simulated connection, mapping, goals, invitations, and completion",
    async () => {
      const { page, context } = await pageFor();
      await page.getByLabel("Full name").fill("Taylor Founder");
      await page.getByLabel("Email address").fill("taylor@prototype.example");
      await page
        .getByLabel("Password", { exact: true })
        .fill("This-is-not-saved-2026");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page.getByRole("heading", { name: "One quick check." }).waitFor();
      await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Create company", exact: true })
        .first()
        .click();
      await page.getByLabel("Company name").fill("Forma Technologies");
      await page.getByLabel("Industry").selectOption("Technology & software");
      await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
      for (const name of ["Finance", "Project Delivery", "Human Resources"])
        await page
          .getByRole("button", { name: new RegExp("^" + name) })
          .click();
      await page.screenshot({
        path: `${output}/departments-desktop.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: /Revenue growth/ }).click();
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
      await page.getByText("Sample adapter active", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("button", {
          name: "Select Business performance · 2026",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Use selected sources", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Discover sample structures",
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", { name: "A structure worth exploring." })
        .waitFor();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Confirm or ignore" })
        .waitFor();
      await page
        .getByRole("button", { name: "Confirm Monthly Revenue", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Confirm Operating Expenses",
          exact: true,
        })
        .click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByLabel("KPI name").fill("Revenue");
      await page
        .getByRole("button", { name: "Add metric", exact: true })
        .click();
      await page.getByLabel("Calculation").fill("Sum of monthly revenue");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("button", { name: "Add goal", exact: true }).click();
      await page.getByLabel("Goal name").fill("Build predictable revenue");
      await page.getByLabel("Target value").fill("500000");
      await page.getByLabel("Deadline").fill("2027-03-31");
      await page
        .getByRole("button", { name: "Save goal", exact: true })
        .click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByLabel("Invitation email 1")
        .fill("colleague@prototype.example");
      await page.getByLabel("Invitation role 1").selectOption("Executive");
      await page
        .getByRole("button", { name: "Add another person", exact: true })
        .click();
      await page
        .getByLabel("Invitation email 2")
        .fill("manager@prototype.example");
      await page
        .getByLabel("Invitation role 2")
        .selectOption("Department Manager");
      await page.getByLabel("Finance", { exact: true }).check();
      await page
        .getByRole("button", { name: "Send invitations", exact: true })
        .click();
      await page
        .getByText("colleague@prototype.example", { exact: true })
        .first()
        .waitFor();
      await page.screenshot({
        path: `${output}/team-desktop.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByText("2 pending", { exact: true }).waitFor();
      await page.reload();
      await page.getByText("2 pending", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Enter Aynor", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Open dashboard", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      assert.ok(
        !(
          await page.evaluate(() =>
            localStorage.getItem("aynor.frontend-prototype.v1"),
          )
        ).includes("This-is-not-saved-2026"),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("link", { name: "Refine workspace", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Everything in its place." })
        .waitFor();
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `${output}/review-mobile.png`,
        fullPage: true,
      });
      await context.close();
    },
  );
  await check(
    "invitation entry preserves context through prototype signup",
    async () => {
      const { page, context } = await pageFor();
      await page.goto(base + "/invite/prototype-invitation");
      await page.getByRole("link", { name: "Get started" }).click();
      await page.getByLabel("Full name").fill("Jordan Executive");
      await page.getByLabel("Email address").fill("guest@aynor.example");
      await page
        .getByLabel("Password", { exact: true })
        .fill("Another-sample-2026");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
      await page.getByRole("heading", { name: "You’re invited." }).waitFor();
      await page.screenshot({
        path: `${output}/invitation-desktop.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Accept invitation", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      assert.equal(
        await page.getByRole("link", { name: "Team & permissions" }).count(),
        0,
      );
      await context.close();
    },
  );
  await check(
    "simulated error recovery and unsaved-change dialog",
    async () => {
      const { page, context } = await pageFor();
      await page.getByRole("button", { name: /Explore the prototype/ }).click();
      await page
        .getByRole("link", { name: "Continue setting up" })
        .first()
        .click();
      await page.getByRole("link", { name: /Business priorities/ }).click();
      await page.getByRole("button", { name: /Profitability/ }).click();
      await page.getByRole("link", { name: "Overview", exact: true }).click();
      await page
        .getByRole("dialog", { name: "Keep your latest changes?" })
        .waitFor();
      await page
        .getByRole("button", { name: "Save & continue", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await page
        .getByRole("button", { name: "Prototype", exact: false })
        .last()
        .click();
      await page
        .getByRole("button", { name: "Service error on next action" })
        .click();
      await page
        .getByRole("link", { name: "Resume setup", exact: true })
        .click();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "simulated service error" })
        .waitFor();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.getByRole("heading", { name: "Connect the dots." }).waitFor();
      await context.close();
    },
  );
  assert.deepEqual(errors, [], "No browser runtime errors");
  assert.deepEqual(apiRequests, [], "No backend API requests");
  console.log(`${passed} frontend journeys passed; zero backend requests.`);
} finally {
  await browser.close();
}
