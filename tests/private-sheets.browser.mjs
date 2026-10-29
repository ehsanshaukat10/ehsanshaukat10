import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  const login = await page.request.post(
    "http://127.0.0.1:5176/api/auth/login",
    {
      data: {
        email: "owner@example.test",
        password: "a-long-test-password-only",
      },
    },
  );
  assert.ok(login.ok());
  const create = await page.request.post(
    "http://127.0.0.1:5176/api/companies",
    {
      data: {
        name: "Private Sheets browser",
        industry: "Technology",
        country: "Pakistan",
        currency: "PKR",
        timezone: "Asia/Karachi",
      },
    },
  );
  assert.ok(create.ok());
  const company = (await create.json()).id;
  const mappingPath = `/companies/${company}/onboarding/mapping`;
  const sheet =
    "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit#gid=0";
  // Missing setup must open actionable help, rather than leave dead buttons.
  await page.route("**/api/companies/*/sheets", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        configured: false,
        googleSetup: {
          ready: false,
          missing: [
            "GOOGLE_CLIENT_ID",
            "GOOGLE_CLIENT_SECRET",
            "GOOGLE_REDIRECT_URI",
            "SHEETS_ENCRYPTION_KEY",
          ],
          invalid: [],
        },
      },
    });
  });
  await page.goto("http://127.0.0.1:5176" + mappingPath);
  await page.getByLabel("Spreadsheet link", { exact: true }).fill(sheet);
  const connectRead = page.getByRole("button", {
    name: "Connect Google & read columns",
    exact: true,
  });
  await expect(connectRead).toBeEnabled();
  await connectRead.click();
  const setup = page.getByRole("dialog", { name: "Set up Google connection" });
  await expect(setup).toBeVisible();
  await expect(setup).toContainText("GOOGLE_CLIENT_ID");
  await expect(
    setup.getByRole("link", { name: /Open Google Cloud/ }),
  ).toHaveAttribute(
    "href",
    "https://console.cloud.google.com/apis/library/sheets.googleapis.com",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await setup
    .getByRole("button", { name: "Close", exact: true })
    .last()
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.unroute("**/api/companies/*/sheets");
  // The real app's one-use, session-bound callback and SQL remain in use.
  // Only Google's consent screen is replaced by a controlled redirect.
  await page.route(
    "https://accounts.google.com/o/oauth2/v2/auth**",
    async (route) => {
      const consent = new URL(route.request().url());
      assert.equal(
        consent.searchParams.get("scope"),
        "https://www.googleapis.com/auth/spreadsheets.readonly",
      );
      const callback = new URL(consent.searchParams.get("redirect_uri"));
      callback.protocol = "http:"; // Local fixture uses HTTP; production is HTTPS.
      callback.searchParams.set("state", consent.searchParams.get("state"));
      callback.searchParams.set("code", "fixture-code");
      await route.fulfill({
        status: 302,
        headers: { location: callback.href },
      });
    },
  );
  await connectRead.click();
  await expect(page).toHaveURL(new RegExp(mappingPath + "(?:\\?|$)"));
  await expect(
    page.getByLabel("Spreadsheet tab", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Spreadsheet link", { exact: true }),
  ).toHaveValue(sheet);
  await expect(page.getByLabel("Date column", { exact: true })).toHaveValue(
    "Date",
  );
  await expect(page.getByLabel("Money in column", { exact: true })).toHaveValue(
    "Revenue",
  );
  await page
    .getByRole("button", { name: "Use these columns", exact: true })
    .click();
  await expect(page.locator(".onboarding-mapping-summary")).toContainText(
    "Data imported",
  );
  await page.goto(`http://127.0.0.1:5176/companies/${company}/overview`);
  await expect(
    page
      .locator(".intel-kpi")
      .filter({ has: page.locator("span").filter({ hasText: /^Revenue$/ }) }),
  ).toContainText("500");
  await page.reload();
  await expect(page.locator(".live-records tbody tr")).toHaveCount(1);
  assert.deepEqual(errors, []);
  console.log(
    "PASS private Sheets → setup help → bound Google consent → return to onboarding → restore link and read columns → mapping → persisted financial dashboard (controlled Google provider)",
  );
} catch (error) {
  console.log(await page.locator("body").innerText());
  await page.screenshot({
    path: "/tmp/aynor-private-sheets-failure.png",
    fullPage: true,
  });
  throw error;
} finally {
  await browser.close();
}
