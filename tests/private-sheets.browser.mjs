import {
  scenario,
  workspace,
  privateConnect,
  map,
  save,
  expect,
  responsive,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "Google connection hides link before consent → shows account email → add workbook → separate mapping → working sync",
  async (page) => {
    const w = await workspace(page, "Private feedback");
    await page.goto(w.base + "/onboarding/integrations");
    await privateConnect(page, w.base);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/onboarding\/mapping$/);
    await map(page, "Finance");
    await save(page);
    await page.getByRole("button", { name: "Sync now", exact: true }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Sync checked" }),
    ).toBeVisible();
    await expect(page.locator(".source-page")).toContainText("No data changes");
    await page.goto(w.base + "/overview");
    await expect(
      page.locator(".intel-kpi").filter({ hasText: "Revenue" }),
    ).toContainText("500");
    await responsive(page);
  },
);
