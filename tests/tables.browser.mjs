import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import { tableWorkbookFixture } from "./fixtures/upload-workbook.mjs";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
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
        name: "Operations tables",
        industry: "Technology",
        country: "Pakistan",
        currency: "PKR",
        timezone: "Asia/Karachi",
      },
    },
  );
  const id = (await created.json()).id,
    base = `http://127.0.0.1:5176/companies/${id}`;
  await page.goto(base + "/onboarding/integrations");
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  await page
    .getByLabel("Upload Excel or CSV file", { exact: true })
    .setInputFiles({
      name: "Operations.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: tableWorkbookFixture(),
    });
  await expect(
    page.getByLabel("How would you like to use this data?", { exact: true }),
  ).toHaveValue("table");
  await expect(page.getByLabel("Header row", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("Type for Status", { exact: true })).toHaveValue(
    "text",
  );
  await page.locator(".sheet-source-controls > summary").click();
  await page.getByLabel("Worksheet", { exact: true }).selectOption("1");
  await page
    .getByRole("button", { name: "Keep this table & add another", exact: true })
    .click();
  await page.getByLabel("Worksheet", { exact: true }).selectOption("0");
  await page
    .getByLabel("What is this table about?", { exact: true })
    .selectOption("Testing");
  await page
    .getByLabel("Type for Run date", { exact: true })
    .selectOption("date");
  await page
    .getByLabel("Date format in this table", { exact: true })
    .selectOption("dmy");
  await page
    .getByText("Connect related tables · optional", { exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "QA → Reference · Case ID" })
    .check();
  await page
    .getByRole("button", { name: "Import 2 tables", exact: true })
    .click();
  await expect(page.locator(".live-source .intel-status")).toHaveText("synced");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(/onboarding\/mapping$/);
  await expect(page.locator(".onboarding-mapping-summary")).toContainText(
    "original column names",
  );
  await page.goto(base + "/overview");
  await expect(page.getByLabel("Imported table dashboard")).toBeVisible();
  await expect(page.locator(".table-relationships")).toContainText(
    "30 linked records",
  );
  await page
    .getByRole("button", { name: "View QA", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Related to CASE-1" }),
  ).toBeVisible();
  await expect(page.locator(".table-report-records tbody tr")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Show all records", exact: true })
    .click();
  await expect(page.locator(".table-report-records tbody tr")).toHaveCount(25);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".table-report-records tbody tr")).toHaveCount(5);
  await page
    .getByLabel("Search this table", { exact: true })
    .fill("not-a-record");
  await expect(
    page.getByText("No records match. Try another search.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search this table", { exact: true }).fill("Passed");
  await expect(page.locator(".table-report-records tbody tr")).toHaveCount(15);
  await page.reload();
  await expect(page.locator(".table-relationships")).toContainText(
    "30 linked records",
  );
  await page.screenshot({
    path: "/tmp/aynor-table-dashboard.png",
    fullPage: true,
  });
  for (const width of [390, 768, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    );
  }
  assert.deepEqual(errors, []);
  console.log(
    "PASS nonfinancial multi-tab Excel → header detection → explicit date locale → confirmed unique-key relationship → persistence → onboarding review → table dashboard → related-record navigation → search/pagination → responsive layouts",
  );
} catch (error) {
  console.log(await page.locator("body").innerText());
  await page.screenshot({
    path: "/tmp/aynor-tables-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
