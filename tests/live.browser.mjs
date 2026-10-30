import {
  scenario,
  workspace,
  map,
  save,
  responsive,
  expect,
  assert,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "shared URL connects before mapping → department properties → real financial report → persisted dashboard",
  async (page) => {
    const w = await workspace(page, "URL feedback");
    await page.goto(w.base + "/onboarding/integrations");
    await page.getByRole("button", { name: "Paste URL", exact: true }).click();
    await page
      .getByLabel("Source name", { exact: true })
      .fill("Sales workbook");
    await page
      .getByLabel("Sheet URL", { exact: true })
      .fill(
        "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
      );
    await page
      .getByRole("button", { name: "Add shared sheet", exact: true })
      .click();
    await expect(page.locator(".source-parent")).toContainText(
      "1/1 pages mapped",
    );
    await expect(
      page.getByLabel("Property for Date", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "Your data is ready" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Review mapping", exact: true })
      .click();
    await expect(page).toHaveURL(/onboarding\/mapping$/);
    await map(page, "Shared worksheet");
    await expect(
      page.getByLabel("Property for Revenue", { exact: true }),
    ).toHaveValue("money_in");
    await save(page);
    await page.goto(w.base + "/overview");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toContainText("3,000");
    await expect(page.getByLabel("Imported table dashboard")).toContainText(
      "Sales workbook",
    );
    await page.reload();
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toContainText("3,000");
    await responsive(page);
  },
);
