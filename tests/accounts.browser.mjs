import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = "http://127.0.0.1:5176";
try {
  assert.ok(
    (
      await page.request.post(base + "/api/auth/login", {
        data: {
          email: "owner@example.test",
          password: "a-long-test-password-only",
        },
      })
    ).ok(),
  );
  const create = await page.request.post(base + "/api/companies", {
    data: {
      name: "Original owner workspace",
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
  });
  const ownerCompany = (await create.json()).id;
  await page.goto(`${base}/companies/${ownerCompany}/overview`);
  const secondTab = await context.newPage();
  await secondTab.goto(page.url());
  await expect(page.locator(".sidebar-sign-out")).toBeVisible();
  await page.locator(".sidebar-sign-out").click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(secondTab).toHaveURL(/\/auth\/login$/);
  await secondTab.close();
  assert.equal(
    (await (await page.request.get(base + "/api/session")).json()).user,
    null,
  );
  await page.getByRole("link", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/signup$/);
  await page.getByLabel("Full name", { exact: true }).fill("New Tester");
  await page
    .getByLabel("Email address", { exact: true })
    .fill("new-tester@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("new-account-password-long");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Verification code", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "I've confirmed my email", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("new-tester@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("new-account-password-long");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm your email");
  assert.ok(
    (
      await page.request.post(base + "/api/__fixture/confirm-email", {
        data: { email: "new-tester@example.test" },
      })
    ).ok(),
  );
  await page.goto(base + "/auth/confirmed#access_token=must-be-removed");
  await expect(
    page.getByRole("heading", { name: "Ready to sign in.", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(base + "/auth/confirmed");
  await page
    .getByRole("link", { name: "Continue to sign in", exact: true })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill("new-tester@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("new-account-password-long");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Let’s build your workspace.",
      exact: true,
    }),
  ).toBeVisible();
  assert.equal(
    (await page.request.get(`${base}/api/companies/${ownerCompany}`)).status(),
    403,
  );
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Separate new workspace");
  await page
    .getByLabel("Industry", { exact: false })
    .selectOption("Technology & software");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "How does your company work?",
      exact: true,
    }),
  ).toBeVisible();
  const newCompany = new URL(page.url()).pathname.split("/")[2];
  await page.goto(`${base}/companies/${newCompany}/overview`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open profile", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Your profile", exact: true })
      .getByRole("button", { name: "Log out", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/auth/logout", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Logout temporarily unavailable. Retry." },
    }),
  );
  await page.locator(".sidebar-sign-out").click();
  await expect(page.locator("body")).toContainText(
    "Logout temporarily unavailable. Retry.",
  );
  await expect(page).toHaveURL(
    new RegExp(`/companies/${newCompany}/overview$`),
  );
  await page.unroute("**/api/auth/logout");
  await page.locator(".sidebar-sign-out").click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await page
    .getByLabel("Email address", { exact: true })
    .fill("owner@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-long-test-password-only");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/(entry|companies)(\/|$)/);
  await page.goto(`${base}/companies/${ownerCompany}/overview`);
  await expect(page.locator(".workspace-identity")).toContainText(
    "Original owner workspace",
  );
  assert.equal(
    (await page.request.get(`${base}/api/companies/${newCompany}`)).status(),
    403,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS dashboard logout → session revocation across tabs → email signup → unconfirmed denial → confirmed login → separate workspace → mobile account logout → retry after failed logout → original owner login (controlled email provider)",
  );
} catch (error) {
  console.log(await page.locator("body").innerText());
  await page.screenshot({
    path: "/tmp/aynor-accounts-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
