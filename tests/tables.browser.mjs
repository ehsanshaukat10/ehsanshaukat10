import {
  scenario,
  workspace,
  upload,
  map,
  save,
  expect,
  assert,
  responsive,
} from "./fixtures/feedback-browser.mjs";
import { tableWorkbookFixture } from "./fixtures/upload-workbook.mjs";
await scenario(
  "all Excel pages retained → department mapping → modal preview/help → unmapped coverage → map remaining page without reupload",
  async (page) => {
    const w = await workspace(page, "Multi page feedback");
    await page.goto(w.base + "/onboarding/integrations");
    await upload(page, "Operations.xlsx", tableWorkbookFixture());
    await expect(page.locator(".source-parent")).toContainText(
      "2/2 pages mapped",
    );
    await page
      .getByRole("button", { name: "Review mapping", exact: true })
      .click();
    await expect(page).toHaveURL(/onboarding\/mapping$/);
    await map(page, "QA", "QA");
    await page.screenshot({
      path: "/tmp/aynor-feedback-mapping.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Preview sheet", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Operations.xlsx");
    await expect(page.getByRole("dialog").locator("table")).toContainText(
      "29/10/2026",
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Mapping help", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Date");
    await page.keyboard.press("Escape");
    await page
      .getByLabel("Property for Run date", { exact: true })
      .selectOption("date");
    await page
      .getByLabel("Date format in this table", { exact: true })
      .selectOption("dmy");
    await save(page);
    await expect(page.locator(".source-parent")).toContainText(
      "2/2 pages mapped",
    );
    await page.goto(w.base + "/overview");
    await expect(page.locator(".source-coverage")).toContainText("2 of 2");
    await page.goto(w.base + "/settings/connections?map=1");
    await map(page, "Reference", "QA");
    await save(page);
    await page.goto(w.base + "/overview");
    await expect(page.locator(".source-coverage")).toContainText("2 of 2");
    await expect(
      page.getByLabel("Imported tables").getByRole("button"),
    ).toHaveCount(2);
    await page.getByLabel("Search this table", { exact: true }).fill("CASE-1");
    await expect(page.locator(".table-report-records tbody tr")).toHaveCount(
      11,
    );
    await page.reload();
    await expect(page.locator(".source-coverage")).toContainText("2 of 2");
    await responsive(page);
  },
);
