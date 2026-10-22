import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
const base = process.env.PROTOTYPE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const errors = [],
  requests = [];
let passed = 0;
async function start(width = 1440) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/")) requests.push(r.url());
  });
  await page.goto(base);
  await page.getByRole("heading", { name: /Your business/ }).waitFor();
  await page.getByRole("button", { name: /^Skip for now/ }).click();
  return { page, context };
}
async function company(page, name = "Meridian Group") {
  await page.getByLabel("Company name", { exact: true }).fill(name);
  await page.getByLabel("Industry").selectOption("Technology & software");
  await page.getByLabel("Company website").fill("meridian.example");
  await page.getByLabel("Company size").selectOption("11–50 employees");
  await page.getByLabel("Business model").selectOption("B2B");
  for (const label of ["City", "Time zone", "Currency"])
    await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("You’ll be the workspace Owner.", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await heading(page, "How does your company work?");
}
const heading = (page, name) =>
  page.getByRole("heading", { name, exact: true }).waitFor();
const next = (page) =>
  page.getByRole("button", { name: "Continue", exact: true }).click();
const skip = (page) =>
  page.getByRole("button", { name: "Skip for now", exact: true }).click();
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS " + name);
}
try {
  await check(
    "seven-step flow, local CSV mapping, inline goals and every review edit link",
    async () => {
      const { page, context } = await start();
      await company(page);
      await expect(page.locator(".onboarding-progress")).toContainText(
        "02 / 7",
      );
      assert.equal(
        await page.getByText("Arrange & refine your departments").count(),
        0,
      );
      await page.getByRole("button", { name: "Finance", exact: true }).click();
      await page.getByLabel("Custom department").fill("Customer success");
      await page
        .getByRole("button", { name: "Add department", exact: true })
        .click();
      await next(page);
      await heading(page, "Bring your information together.");
      await expect(page.locator(".onboarding-progress")).toContainText(
        "03 / 7",
      );
      await page.getByRole("tab", { name: "Upload a file" }).click();
      await page.getByLabel("Upload data file").setInputFiles({
        name: "revenue.csv",
        mimeType: "text/csv",
        buffer: Buffer.from('"Revenue, monthly",Expenses\n1200,400'),
      });
      await expect(page.locator(".seven-attached")).toContainText(
        "2 fields ready",
      );
      await next(page);
      await heading(page, "Give your data meaning.");
      await page.getByLabel("Source field 1").fill("Monthly revenue");
      await expect(page.getByLabel(/Business meaning for/)).toHaveCount(0);
      await next(page);
      await expect(page.getByRole("alert")).toContainText("confirm it");
      await page.getByRole("checkbox").check();
      await page
        .getByRole("button", { name: "Next field", exact: true })
        .click();
      await page.getByRole("checkbox").check();
      await next(page);
      await heading(page, "What matters most?");
      await page.getByRole("button", { name: /Revenue growth/ }).click();
      await page.getByLabel("Custom priority").fill("Customer retention");
      await page
        .getByRole("button", { name: "Add priority", exact: true })
        .click();
      await next(page);
      await heading(page, "Give ambition a direction.");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.getByLabel("Goal name").fill("Grow recurring revenue");
      await page
        .getByLabel("Goal description (optional)")
        .fill("Focus on recurring contracts.");
      await page.getByLabel("Target value").fill("20%");
      await page.getByLabel("Deadline").fill("2027-12-31");
      await page.getByLabel("Goal owner (optional)").fill("Alex");
      await page
        .getByRole("button", { name: "Save goal", exact: true })
        .click();
      await expect(page.locator(".seven-goals-list")).toContainText(
        "Grow recurring revenue",
      );
      await page
        .getByRole("button", {
          name: "Edit goal Grow recurring revenue",
          exact: true,
        })
        .click();
      await page.getByLabel("Target value").fill("25%");
      await page
        .getByRole("button", { name: "Update goal", exact: true })
        .click();
      await next(page);
      await heading(page, "Everything in its place.");
      await expect(page.locator(".onboarding-progress")).toContainText(
        "07 / 7",
      );
      await expect(page.locator(".seven-review-section")).toHaveCount(6);
      await expect(page.locator(".seven-review")).toContainText("B2B");
      await expect(page.locator(".seven-review")).toContainText("25%");
      for (const [label, title] of [
        ["departments", "How does your company work?"],
        ["data sheets", "Bring your information together."],
        ["field mapping", "Give your data meaning."],
        ["business priorities", "What matters most?"],
        ["business goals", "Give ambition a direction."],
      ]) {
        await page
          .getByRole("link", { name: "Edit " + label, exact: true })
          .click();
        await heading(page, title);
        await page
          .getByRole("button", { name: "Save & return to review", exact: true })
          .click();
        await heading(page, "Everything in its place.");
      }
      await page
        .getByRole("link", { name: "Edit company details", exact: true })
        .click();
      await page
        .getByLabel("Company name", { exact: true })
        .fill("Meridian Updated");
      await page
        .getByRole("button", { name: "Save company details", exact: true })
        .click();
      await heading(page, "Everything in its place.");
      await expect(page.locator(".seven-review")).toContainText(
        "Meridian Updated",
      );
      await page
        .getByRole("button", { name: "Enter Aynor", exact: true })
        .click();
      await heading(page, "Make room for better decisions.");
      await expect(
        page.getByText("A CLEARER BEGINNING", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", {
          name: "Your workspace is ready.",
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(page.locator(".seven-complete-restored")).toContainText(
        "Meridian Updated has a place of its own.",
      );
      await page.screenshot({
        path: "/tmp/aynor-restored-completion.png",
        fullPage: true,
      });
      await page
        .getByRole("link", { name: "Open dashboard", exact: true })
        .click();
      await heading(page, "A clearer picture.");
      for (const mode of ["login", "signup"]) {
        await page.goto(base + "/auth/" + mode);
        await page
          .getByRole("button", {
            name: "Skip for now · continue to onboarding",
            exact: true,
          })
          .click();
        await heading(page, "Let’s build your workspace.");
        await expect(page).toHaveURL(base + "/companies/new");
      }
      await context.close();
    },
  );
  await check(
    "Google connection denial/retry, mapping and optional priorities/goals skip",
    async () => {
      const { page, context } = await start();
      await company(page, "Sheets Team");
      await next(page);
      await page
        .getByRole("button", { name: "Connect Google Sheets", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Deny access", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        "Access wasn’t granted",
      );
      await page
        .getByRole("button", { name: "Connect Google Sheets", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Allow sample access", exact: true })
        .click();
      await expect(page.locator(".seven-attached")).toContainText("4 fields");
      await next(page);
      await heading(page, "Give your data meaning.");
      await skip(page);
      await heading(page, "What matters most?");
      await skip(page);
      await heading(page, "Give ambition a direction.");
      await skip(page);
      await heading(page, "Everything in its place.");
      await expect(page.locator(".seven-review")).toContainText("Skipped");
      await context.close();
    },
  );
  await check(
    "URL validation, file errors and refresh preserve local mappings",
    async () => {
      const { page, context } = await start();
      await company(page, "URL Team");
      await next(page);
      await page.getByRole("tab", { name: "Upload a file" }).click();
      await page.getByLabel("Upload data file").setInputFiles({
        name: "bad.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Revenue,Revenue\n1,2"),
      });
      await expect(page.getByRole("alert")).toContainText("unique");
      await page.getByRole("tab", { name: "Paste a URL" }).click();
      await page
        .getByLabel("Google Sheets URL")
        .fill("https://example.com/sheet");
      await page
        .getByRole("button", { name: "Use spreadsheet URL", exact: true })
        .click();
      await expect(page.getByRole("alert")).toContainText(
        "valid Google Sheets URL",
      );
      await page
        .getByLabel("Google Sheets URL")
        .fill("https://docs.google.com/spreadsheets/d/example123/edit");
      await page
        .getByRole("button", { name: "Use spreadsheet URL", exact: true })
        .click();
      await expect(page.locator(".seven-attached")).toContainText("3 fields");
      await next(page);
      await page.getByLabel("Source field 1").fill("Reporting date");
      await page.reload();
      await expect(page.getByLabel("Source field 1")).toHaveValue(
        "Reporting date",
      );
      await context.close();
    },
  );
  await check(
    "desktop/tablet/mobile readability and seven-step layout",
    async () => {
      for (const width of [1440, 1024, 768, 390, 360]) {
        const { page, context } = await start(width);
        await company(page, "Responsive");
        await next(page);
        for (let i = 0; i < 4; i++) {
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth,
            ),
            "overflow at " + width,
          );
          const fonts = await page
            .locator("input:not([type=checkbox]),select")
            .evaluateAll((es) =>
              es
                .filter((e) => e.getClientRects().length)
                .map((e) => parseFloat(getComputedStyle(e).fontSize)),
            );
          assert.ok(fonts.every((s) => s >= 16));
          await skip(page);
        }
        await heading(page, "Everything in its place.");
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        );
        assert.ok(
          await page.evaluate(() =>
            getComputedStyle(document.body).fontFamily.includes("Geist"),
          ),
        );
        await page.evaluate(() => document.fonts.ready);
        assert.ok(
          await page.evaluate(() => document.fonts.check('400 16px "Geist"')),
        );
        if (width === 1440 || width === 390)
          await page.screenshot({
            path: `/tmp/aynor-seven-review-${width}.png`,
            fullPage: true,
          });
        await context.close();
      }
    },
  );
  await check(
    "removed routes resolve into retained onboarding screens",
    async () => {
      const { page, context } = await start();
      await company(page, "Legacy");
      const root = page.url().split("/onboarding/")[0];
      for (const [old, title] of [
        ["sources", "Bring your information together."],
        ["discovery", "Give your data meaning."],
        ["readiness", "Give your data meaning."],
        ["kpis", "Give ambition a direction."],
        ["invite", "Everything in its place."],
      ]) {
        await page.goto(root + "/onboarding/" + old);
        await heading(page, title);
      }
      await context.close();
    },
  );
  await check(
    "entry bypasses company selection with multiple workspaces",
    async () => {
      const { page, context } = await start();
      await company(page, "First Workspace");
      await page.goto(base + "/companies/new");
      await company(page, "Second Workspace");
      const second = page.url();
      await page.goto(base + "/entry");
      await heading(page, "How does your company work?");
      await expect(page).toHaveURL(second);
      await context.close();
    },
  );
  await check(
    "login and signup fit desktop, tablet and small mobile viewports",
    async () => {
      for (const [width, height] of [
        [1440, 900],
        [1366, 768],
        [1024, 768],
        [768, 1024],
        [390, 844],
        [360, 640],
        [320, 568],
      ]) {
        for (const mode of ["login", "signup"]) {
          const context = await browser.newContext({
            viewport: { width, height },
            reducedMotion: "reduce",
          });
          const page = await context.newPage();
          await page.goto(base + "/auth/" + mode);
          await heading(
            page,
            mode === "login" ? "Welcome back." : "Create your account",
          );
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollHeight <= innerHeight,
            ),
            mode + " page scroll at " + width + "x" + height,
          );
          const controls = await page
            .locator(".auth-body input,.auth-submit,.skip-signin")
            .evaluateAll((es) =>
              es.map((e) => {
                const b = e.getBoundingClientRect();
                return { top: b.top, bottom: b.bottom };
              }),
            );
          assert.ok(
            controls.every((b) => b.top >= 0 && b.bottom <= height),
            mode + " controls exceed viewport at " + width + "x" + height,
          );
          await context.close();
        }
      }
    },
  );
  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  console.log(`${passed} frontend checks passed; zero backend requests.`);
} finally {
  await browser.close();
}
