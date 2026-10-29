import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { excelFixture } from "./fixtures/upload-workbook.mjs";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  assert.ok(
    (
      await page.request.post("http://127.0.0.1:5176/api/auth/login", {
        data: {
          email: "owner@example.test",
          password: "a-long-test-password-only",
        },
      })
    ).ok(),
  );
  const created = await page.request.post(
    "http://127.0.0.1:5176/api/companies",
    {
      data: {
        name: "Workbook browser",
        industry: "Technology",
        country: "Pakistan",
        currency: "PKR",
        timezone: "Asia/Karachi",
      },
    },
  );
  const company = (await created.json()).id,
    base = `http://127.0.0.1:5176/companies/${company}`;
  const now = new Date(),
    date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
  await page.goto(base + "/onboarding/integrations");
  const tabs = page.locator(".sheet-source-tabs button");
  await expect(tabs).toHaveText([
    "Connect Google",
    "Upload sheet",
    "Paste URL",
  ]);
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  const input = page.getByLabel("Upload Excel or CSV file", { exact: true });
  await input.setInputFiles({
    name: "bad.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toContainText("could not be read");
  await input.setInputFiles({
    name: "Business.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: excelFixture(date),
  });
  await expect(page.getByLabel("Worksheet", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Header row", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Date column", { exact: true })).toHaveValue(
    "Date",
  );
  await expect(page.locator(".column-matches")).toContainText("Money in");
  await expect(page.locator(".column-matches")).toContainText("Money out");
  await expect(page.locator(".column-match-count")).toHaveText(
    "3 of 3 selected",
  );
  await expect(
    page
      .getByLabel("Money in column", { exact: true })
      .locator('option[value="Date"]'),
  ).toHaveAttribute("disabled", "");
  await expect(page.locator(".live-source table")).toBeHidden();
  await page.locator(".mapping-detail > summary").first().click();
  await expect(page.locator(".live-source table")).toBeVisible();
  await expect(page.locator(".live-source table")).toContainText(date);
  await page.locator(".mapping-detail > summary").first().click();
  await page.screenshot({
    path: "/tmp/aynor-simple-column-matches.png",
    fullPage: true,
  });
  // Change worksheets and edit the mapping rather than rely on suggestions.
  await page.locator(".sheet-source-controls > summary").click();
  await page.getByLabel("Worksheet", { exact: true }).selectOption("2");
  await expect(page.getByLabel("Header row", { exact: true })).toHaveValue("0");
  await page
    .getByLabel("How would you like to use this data?", { exact: true })
    .selectOption("financial");
  await page
    .getByLabel("Date column", { exact: true })
    .selectOption("Recorded");
  await page
    .getByRole("button", { name: "Import my sheet", exact: true })
    .click();
  await expect(page.locator(".live-source .intel-status")).toHaveText("synced");
  await page.goto(base + "/overview");
  const revenue = () =>
    page
      .locator(".intel-kpi")
      .filter({ has: page.locator("span").filter({ hasText: /^Revenue$/ }) });
  await expect(
    page.getByLabel("Reporting period", { exact: true }),
  ).toHaveValue("all");
  await expect(revenue()).toContainText("2,500");
  await page.reload();
  await expect(revenue()).toContainText("2,500");
  await page.goto(base + "/settings/connections");
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  await input.setInputFiles({
    name: "Bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Date,Revenue,Expenses\n${date},wrong,500`),
  });
  await page
    .getByRole("button", { name: "Import my sheet", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Row 2");
  const existing = await page.request.get(
    base.replace("/companies/", "/api/companies/") +
      "/sheets/overview?period=all",
  );
  assert.equal((await existing.json()).data.totals.revenue, 2500);
  await input.setInputFiles({
    name: "Update.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Date,Revenue,Expenses\n${date},3200,1000`),
  });
  await page
    .getByRole("button", { name: "Import my sheet", exact: true })
    .click();
  await expect(page.locator(".live-source .intel-status")).toHaveText("synced");
  await page.goto(base + "/overview");
  await expect(revenue()).toContainText("3,200");
  await page.goto(base + "/settings/connections");
  await page.getByRole("button", { name: "Paste URL", exact: true }).click();
  await page
    .getByLabel("Sheet URL", { exact: true })
    .fill(
      "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit#gid=0",
    );
  await page.getByRole("button", { name: "Read columns", exact: true }).click();
  await expect(page.getByLabel("Date column", { exact: true })).toHaveValue(
    "Date",
  );
  await page
    .getByRole("button", { name: "Use these columns", exact: true })
    .click();
  await expect(page.locator(".live-source .intel-status")).toHaveText("synced");
  await page.goto(base + "/overview");
  await expect(revenue()).toContainText("3,000");
  for (const width of [390, 768, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base + "/onboarding/integrations");
    await page
      .getByRole("button", { name: "Upload sheet", exact: true })
      .click();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS real Excel workbook → date cells/cached formulas → header/worksheet selection → editable mapping → persistent report → bad replacement retains data → CSV replacement → shared URL → responsive import UI",
  );
} catch (error) {
  console.log(await page.locator("body").innerText());
  await page.screenshot({
    path: "/tmp/aynor-upload-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
