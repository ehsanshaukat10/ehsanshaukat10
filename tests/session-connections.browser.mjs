import {
  scenario,
  workspace,
  origin,
  expect,
  assert,
  responsive,
} from "./fixtures/feedback-browser.mjs";
import fs from "node:fs";
const out = "/tmp/aynor-session-connections";
fs.mkdirSync(out, { recursive: true });
await scenario(
  "persistent login, company choice, compact connection step, separate mapping, inherited department and active automatic sync with located changes",
  async (page) => {
    await page.request.post(origin + "/api/__fixture/ai", {
      data: { mode: "quota" },
    });
    const w = await workspace(page, "Session and connection acceptance");
    await page.goto(w.base + "/onboarding/integrations");
    await expect(page.locator(".auto-ai-consent")).toHaveCount(0);
    await expect(page.locator(".auto-import-intro")).toHaveCount(0);
    await page.getByRole("button", { name: "Paste URL", exact: true }).click();
    await page
      .getByLabel("Source name", { exact: true })
      .fill("Revenue workbook");
    await page
      .getByLabel("Sheet URL", { exact: true })
      .fill(
        "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
      );
    await page
      .getByRole("button", { name: "Add shared sheet", exact: true })
      .click();
    await expect(page.locator(".source-notice")).toContainText(
      "Workbook connected",
    );
    await expect(page.locator(".source-notice")).toHaveCount(1);
    await expect(page.locator(".source-page")).toHaveCount(0);
    await expect(page.getByLabel("Automatic preparation")).toHaveCount(0);
    await page.screenshot({
      path: out + "/step-3-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: out + "/step-3-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/onboarding\/mapping$/);
    await expect(page.locator(".source-page")).toHaveCount(1);
    await page
      .getByLabel("Department for Revenue workbook", { exact: true })
      .selectOption("QA");
    await expect(page.locator(".source-page")).toContainText("QA");
    await page
      .getByRole("button", { name: "Edit mapping", exact: true })
      .click();
    await expect(
      page.getByLabel("Department for this worksheet", { exact: true }),
    ).toHaveValue("QA");
    await page.screenshot({ path: out + "/step-4-edit.png", fullPage: true });
    await page.clock.install();
    await page.goto(w.base + "/connections");
    await expect(page.locator(".source-parent")).toContainText(
      "Revenue workbook",
    );
    // Local fixture ages saved metadata and changes only synthetic provider data.
    const changed = await page.request.post(
      origin + "/api/__fixture/source-change",
      {
        data: {
          companyId: w.id,
          csv: "Date,Revenue,Expenses\n2026-11-01,3500,500",
        },
      },
    );
    assert.ok(changed.ok());
    await page.clock.fastForward(61000);
    await expect(page.locator(".source-parent")).toContainText(
      "Updated: Shared worksheet",
    );
    await page.locator(".source-parent-toggle").click();
    await expect(page.locator(".source-page")).toContainText("changed");
    await page
      .getByText("Changed record positions and columns", { exact: true })
      .click();
    await expect(page.locator(".source-page")).toContainText("Record 1:");
    await expect(page.locator(".source-page")).toContainText("Revenue");
    await page.screenshot({
      path: out + "/sync-changes-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: out + "/sync-changes-mobile.png",
      fullPage: true,
    });
    await responsive(page);
    await page.clock.resume();
    await page.request.post(origin + "/api/__fixture/source-change", {
      data: { companyId: w.id, csv: null },
    });
    let c = await (await page.request.get(w.api)).json();
    assert.ok(
      (
        await page.request.patch(w.api, {
          data: {
            version: c.version,
            data: {
              ...c.data,
              completed: true,
              step: "integrations",
              steps: { ...c.data.steps, review: "completed" },
            },
          },
        })
      ).ok(),
    );
    const second = await workspace(page, "Second entity requires selection");
    await page.request.post(origin + "/api/auth/logout", { data: {} });
    await page.goto(
      origin +
        "/auth/login?next=" +
        encodeURIComponent(w.base.replace(origin, "") + "/overview"),
    );
    await page
      .getByLabel("Email address", { exact: true })
      .fill("owner@example.test");
    await page
      .getByLabel("Password", { exact: true })
      .fill("a-long-test-password-only");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(origin + "/companies");
    await expect(
      page.getByRole("heading", { name: "Your companies.", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: out + "/company-selection.png",
      fullPage: true,
    });
    const state = await page.context().storageState();
    const cookie = state.cookies.find((c) => c.name === "aynor_session");
    assert.ok(cookie.expires > Date.now() / 1000 + 29 * 86400);
    const fresh = await page
      .context()
      .browser()
      .newContext({ storageState: state });
    try {
      const returning = await fresh.newPage();
      await returning.goto(w.base + "/overview");
      await expect(
        returning.getByRole("heading", { name: "Overview.", exact: true }),
      ).toBeVisible();
      assert.ok(!returning.url().includes("/auth/"));
    } finally {
      await fresh.close();
    }
    assert.ok(second.id !== w.id);
  },
);
