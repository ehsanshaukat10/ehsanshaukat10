import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5173";
const output = "/tmp/aynor-home-split";
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
let passed = 0;
const errors = [],
  requests = [];
async function pageFor(width = 1440, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url());
  });
  await page.goto(base);
  await page.getByRole("heading", { name: /Your business/ }).waitFor();
  return { page, context };
}
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
async function createCompany(page, name) {
  await page
    .getByRole("heading", { name: "Let’s build your workspace.", exact: true })
    .waitFor();
  await page.getByLabel("Company name").fill(name);
  await page.getByLabel("Industry").selectOption("Technology & software");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "How does your company work?", exact: true })
    .waitFor();
}
const next = (page) =>
  page.getByRole("button", { name: "Continue", exact: true }).click();
try {
  await check(
    "Home → login → signup → detailed onboarding → dashboard",
    async () => {
      const { page, context } = await pageFor();
      await page.getByRole("link", { name: "Log in", exact: true }).click();
      await page
        .getByRole("heading", { name: "Welcome back.", exact: true })
        .waitFor();
      await page.getByRole("link", { name: "Get started" }).click();
      await page.getByLabel("Full name").fill("Alex Founder");
      await page.getByLabel("Email address").fill("founder@prototype.example");
      await page
        .getByLabel("Password", { exact: true })
        .fill("A-sample-password-2026");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
      await createCompany(page, "Vordx Technologies");
      assert.equal(
        await page
          .locator(".workspace-sidebar,.setup-nav,.flow-navigator")
          .count(),
        0,
      );
      await expect(page.locator(".onboarding-visual")).toBeVisible();
      for (const d of ["Finance", "Project Delivery", "Human Resources"])
        await page.getByRole("button", { name: new RegExp("^" + d) }).click();
      await next(page);
      await page.getByRole("button", { name: /Revenue growth/ }).click();
      await next(page);
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
      await next(page);
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
        .getByRole("heading", {
          name: "A structure worth exploring.",
          exact: true,
        })
        .waitFor();
      await next(page);
      await page
        .getByRole("button", { name: "Confirm Monthly Revenue", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Confirm Operating Expenses",
          exact: true,
        })
        .click();
      await page.screenshot({
        path: output + "/mapping-desktop.png",
        fullPage: true,
      });
      await next(page);
      await next(page);
      await page.getByLabel("KPI name").fill("Revenue");
      await page
        .getByRole("button", { name: "Add metric", exact: true })
        .click();
      await page.getByLabel("Calculation").fill("Sum of monthly revenue");
      await next(page);
      await page.getByRole("button", { name: "Add goal", exact: true }).click();
      await page.getByLabel("Goal name").fill("Build predictable revenue");
      await page.getByLabel("Target value").fill("500000");
      await page.getByLabel("Deadline").fill("2027-03-31");
      await page
        .getByRole("button", { name: "Save goal", exact: true })
        .click();
      await next(page);
      await page
        .getByLabel("Invitation email 1")
        .fill("colleague@prototype.example");
      await page.getByLabel("Invitation role 1").selectOption("Executive");
      await page
        .getByRole("button", { name: "Send invitations", exact: true })
        .click();
      await page.getByRole("button", { name: "Revoke", exact: true }).waitFor();
      await next(page);
      await page.getByText("1 pending", { exact: true }).waitFor();
      await page
        .getByRole("button", { name: "Enter Aynor", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "Your workspace is ready.", exact: true })
        .waitFor();
      assert.equal(await page.locator(".workspace-sidebar").count(), 0);
      await page
        .getByRole("link", { name: "Open dashboard", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await context.close();
    },
  );
  await check(
    "Home and authentication skip options open a real guest onboarding journey",
    async () => {
      for (const entry of ["home", "login", "signup"]) {
        const { page, context } = await pageFor();
        if (entry !== "home")
          await page
            .getByRole("link", {
              name: entry === "login" ? "Log in" : "Create account",
              exact: true,
            })
            .click();
        await page.getByRole("button", { name: /^Skip for now/ }).click();
        await createCompany(page, "Guest Company " + entry);
        const state = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("aynor.frontend-prototype.v1")),
        );
        const guest = state.users.find((u) => u.id === "onboarding-guest");
        assert.ok(guest?.verified);
        assert.equal(
          state.companies.filter((c) =>
            state.members[c.id]?.some((m) => m.id === guest.id),
          ).length,
          1,
        );
        await context.close();
      }
    },
  );
  await check(
    "onboarding draft refresh, Back, and guest resume preserve entered information",
    async () => {
      const { page, context } = await pageFor();
      await page.getByRole("button", { name: /^Skip for now/ }).click();
      await page.getByLabel("Company name").fill("Resumable Guest");
      await page.reload();
      await expect(page.getByLabel("Company name")).toHaveValue(
        "Resumable Guest",
      );
      await page.getByLabel("Industry").selectOption("Technology & software");
      await page
        .getByRole("button", { name: "Create workspace", exact: true })
        .click();
      await page.getByRole("button", { name: /^Finance/ }).click();
      await page.reload();
      await expect(
        page.getByRole("button", { name: /^Finance/ }),
      ).toHaveAttribute("aria-pressed", "true");
      await next(page);
      await page
        .getByRole("heading", { name: "What matters most?", exact: true })
        .waitFor();
      await page.getByRole("button", { name: "Back", exact: true }).click();
      await expect(
        page.getByRole("button", { name: /^Finance/ }),
      ).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("link", { name: "Aynor home", exact: true }).click();
      await page.getByRole("link", { name: "Log in", exact: true }).click();
      await page
        .getByRole("heading", { name: "Welcome back.", exact: true })
        .waitFor();
      await expect(page.getByLabel("Email address")).toHaveValue("");
      await page.getByRole("link", { name: "Get started" }).click();
      await page
        .getByRole("heading", { name: "Create your account", exact: true })
        .waitFor();
      await page.goto(base + "/home");
      await page
        .getByRole("button", { name: "Continue guest onboarding", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Resume setup", exact: true })
        .click();
      await page
        .getByRole("heading", {
          name: "How does your company work?",
          exact: true,
        })
        .waitFor();
      const state = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("aynor.frontend-prototype.v1")),
      );
      assert.equal(
        state.companies.filter((c) => c.name === "Resumable Guest").length,
        1,
      );
      await context.close();
    },
  );
  await check(
    "desktop, tablet, and mobile layouts stay clean without horizontal overflow",
    async () => {
      for (const [w, h, label] of [
        [1440, 1000, "desktop"],
        [1024, 900, "tablet"],
        [390, 844, "mobile"],
        [360, 800, "small-mobile"],
      ]) {
        const { page, context } = await pageFor(w, h);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          label + " home overflow",
        );
        await page.screenshot({
          path: output + "/home-" + label + ".png",
          fullPage: true,
        });
        await page.getByRole("button", { name: /^Skip for now/ }).click();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          label + " company overflow",
        );
        await createCompany(page, "Responsive " + label);
        assert.equal(
          await page
            .locator(".workspace-sidebar,.setup-nav,.flow-navigator")
            .count(),
          0,
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          label + " departments overflow",
        );
        if (w >= 1024)
          await expect(page.locator(".onboarding-visual")).toBeVisible();
        else await expect(page.locator(".onboarding-visual")).toBeHidden();
        await page.screenshot({
          path: output + "/departments-" + label + ".png",
          fullPage: true,
        });
        await context.close();
      }
    },
  );
  await check(
    "optional stages remain skippable and completion returns to the workspace",
    async () => {
      const { page, context } = await pageFor();
      await page.getByRole("button", { name: /^Skip for now/ }).click();
      await createCompany(page, "Fast Preview");
      for (let i = 0; i < 10; i++)
        await page
          .getByRole("button", { name: "Skip for now", exact: true })
          .click();
      await page
        .getByRole("heading", { name: "Everything in its place.", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Enter Aynor", exact: true })
        .click();
      await page
        .getByRole("link", { name: "Open dashboard", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await context.close();
    },
  );
  await check(
    "invitation context survives signup without forcing company creation",
    async () => {
      const { page, context } = await pageFor();
      await page.goto(base + "/invite/prototype-invitation");
      await page.getByRole("link", { name: "Get started" }).click();
      await page.getByLabel("Full name").fill("Jordan Executive");
      await page.getByLabel("Email address").fill("guest@aynor.example");
      await page
        .getByLabel("Password", { exact: true })
        .fill("A-sample-password-2026");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Verify email", exact: true })
        .click();
      await page
        .getByRole("heading", { name: "You’re invited.", exact: true })
        .waitFor();
      await page
        .getByRole("button", { name: "Accept invitation", exact: true })
        .click();
      await page.getByRole("heading", { name: "A clearer picture." }).waitFor();
      await context.close();
    },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(`${passed} frontend journeys passed; zero backend requests.`);
} finally {
  await browser.close();
}
