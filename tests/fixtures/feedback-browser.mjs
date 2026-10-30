import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
export const origin = "http://127.0.0.1:5176";
export async function scenario(name, task) {
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await task(page);
    assert.deepEqual(errors, []);
    console.log("PASS " + name);
  } catch (e) {
    console.log(await page.locator("body").innerText());
    await page.screenshot({
      path: "/tmp/aynor-feedback-failure.png",
      fullPage: true,
    });
    throw e;
  } finally {
    await browser.close();
  }
}
export async function workspace(page, name) {
  assert.ok(
    (
      await page.request.post(origin + "/api/auth/login", {
        data: {
          email: "owner@example.test",
          password: "a-long-test-password-only",
        },
      })
    ).ok(),
  );
  const created = await page.request.post(origin + "/api/companies", {
    data: {
      name,
      industry: "Technology",
      country: "Pakistan",
      currency: "PKR",
      timezone: "Asia/Karachi",
    },
  });
  const id = (await created.json()).id,
    base = `${origin}/companies/${id}`;
  let company = await (
    await page.request.get(origin + `/api/companies/${id}`)
  ).json();
  assert.ok(
    (
      await page.request.patch(origin + `/api/companies/${id}`, {
        data: {
          version: company.version,
          data: { ...company.data, departments: ["Finance", "QA"] },
        },
      })
    ).ok(),
  );
  return {
    id,
    base,
    api: origin + `/api/companies/${id}`,
    sources: origin + `/api/companies/${id}/sources`,
  };
}
export async function upload(page, name, buffer) {
  await page.getByRole("button", { name: "Upload sheet", exact: true }).click();
  await page
    .getByLabel("Upload Excel or CSV file", { exact: true })
    .setInputFiles({
      name,
      mimeType: name.endsWith("csv")
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Your data is ready" }),
  ).toBeVisible();
}
export async function map(page, title, department = "Finance") {
  const row = page.locator(".source-page").filter({
    has: page.locator("strong").filter({ hasText: new RegExp(`^${title}$`) }),
  });
  await row
    .getByRole("button", { name: /^(Map columns|Edit mapping)$/ })
    .click();
  await page
    .getByLabel("Department for this worksheet", { exact: true })
    .selectOption(department);
}
export async function save(page) {
  await page
    .getByRole("button", { name: /^Save (mapping|\d+ page mappings)$/ })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /worksheet page.* mapped/ }),
  ).toBeVisible();
}
export async function responsive(page) {
  for (const width of [390, 768, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow at ${width}`,
    );
  }
}
export async function privateConnect(page, base) {
  await expect(
    page.getByLabel("Google spreadsheet link", { exact: true }),
  ).toHaveCount(0);
  await page.route(
    "https://accounts.google.com/o/oauth2/v2/auth**",
    async (route) => {
      const consent = new URL(route.request().url()),
        state = consent.searchParams.get("state"),
        redirect = consent.searchParams.get("redirect_uri");
      assert.ok(
        consent.searchParams.get("scope").includes("spreadsheets.readonly"),
      );
      assert.ok(!consent.searchParams.get("scope").includes("auth/drive"));
      await route.fulfill({
        status: 302,
        headers: {
          location:
            redirect.replace("https://127.0.0.1", "http://127.0.0.1") +
            "?state=" +
            encodeURIComponent(state) +
            "&code=fixture",
        },
        body: "",
      });
    },
  );
  await page
    .locator(".source-account")
    .getByRole("button", { name: "Connect Google", exact: true })
    .click();
  await expect(page.locator(".source-account")).toContainText(
    "sheets-owner@example.test",
  );
  await expect(
    page.getByLabel("Google spreadsheet link", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Google spreadsheet link", { exact: true })
    .fill(
      "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
    );
  await page
    .getByRole("button", { name: "Add spreadsheet", exact: true })
    .click();
  await expect(
    page.locator(".source-parent").filter({ hasText: "Private report" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Your data is ready" }),
  ).toBeVisible();
}
export { expect, assert };
