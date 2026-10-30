import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const base = "http://127.0.0.1:5176",
  email = "customer-full@example.test",
  password = "customer-password-long";
async function login(next = "") {
  await page.goto(base + "/auth/login" + next);
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}
try {
  await page.goto(base + "/auth/signup");
  await page.getByLabel("Full name", { exact: true }).fill("Full Customer");
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your inbox.", exact: true }),
  ).toBeVisible();
  await login();
  await expect(page.getByRole("alert")).toContainText("Confirm your email");
  await page
    .getByRole("button", { name: "Resend confirmation email", exact: true })
    .click();
  await expect(
    page.getByLabel("Confirmation email", { exact: true }),
  ).toHaveValue(email);
  // Following an expired or invented callback does not create a session.
  await page.goto(
    base +
      "/auth/confirmed#error=access_denied&error_description=This%20link%20expired&access_token=never-trust-this",
  );
  await expect(page.getByRole("alert")).toContainText("expired");
  assert.equal(
    (await (await page.request.get(base + "/api/session")).json()).user,
    null,
  );
  const proof = await (
    await page.request.post(base + "/api/__fixture/confirm-email", {
      data: { email },
    })
  ).json();
  await page.goto(
    base + "/auth/confirmed#type=signup&access_token=" + proof.accessToken,
  );
  await expect(
    page.getByRole("heading", {
      name: "Let’s build your workspace.",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Customer Journey Company");
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
  const company = new URL(page.url()).pathname.split("/")[2];
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "at least one department",
  );
  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/companies/${company}/onboarding/integrations$`),
  );
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await login("?next=" + encodeURIComponent(`/companies/${company}/overview`));
  await expect(page).toHaveURL(
    new RegExp(`/companies/${company}/onboarding/integrations$`),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Upload sheet", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Connect a workbook");
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  const now = new Date(),
    date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
  await page
    .getByLabel("Upload Excel or CSV file", { exact: true })
    .setInputFiles({
      name: "Customer.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`Date,Revenue,Expenses\n${date},5000,1700`),
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Your data is ready" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What matters most?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Give ambition a direction.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Everything in its place.",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enter Aynor", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open dashboard", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open dashboard", exact: true }).click();
  const revenue = () =>
    page
      .locator(".intel-kpi")
      .filter({ has: page.locator("span").filter({ hasText: /^Revenue$/ }) });
  await expect(revenue()).toContainText("5,000");
  await page.reload();
  await expect(revenue()).toContainText("5,000");
  await page.locator(".sidebar-sign-out").click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await login();
  await expect(page).toHaveURL(new RegExp(`/companies/${company}/overview$`));
  await expect(revenue()).toContainText("5,000");
  // Explicitly skipping data also skips its dependent mapping screen.
  await page.goto(base + "/companies/new");
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Intentionally empty workspace");
  await page
    .getByLabel("Industry", { exact: false })
    .selectOption("Technology & software");
  await page
    .getByRole("button", { name: "Create workspace", exact: true })
    .click();
  await page.getByRole("button", { name: "Finance", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What matters most?", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await page.getByRole("button", { name: "Enter Aynor", exact: true }).click();
  await expect(page.locator(".seven-complete")).toContainText("data pending");
  await page.getByRole("link", { name: "Open dashboard", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Connect your first spreadsheet",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".intel-kpi")).toHaveCount(0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS full customer journey: signup → unconfirmed and expired-link denial → confirmation → company → required departments → logout/login resumes saved onboarding despite dashboard link → upload → mapping review → explicit optional skips → review → persisted real dashboard → logout/login returns to completed dashboard",
  );
} catch (error) {
  console.log(await page.locator("body").innerText());
  await page.screenshot({
    path: "/tmp/aynor-customer-journey-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
