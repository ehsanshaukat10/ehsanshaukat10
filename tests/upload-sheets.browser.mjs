import {
  scenario,
  workspace,
  upload,
  map,
  save,
  expect,
  assert,
  privateConnect,
} from "./fixtures/feedback-browser.mjs";
await scenario(
  "uploads and shared URLs coexist → bad replacement retains report → independent removal",
  async (page) => {
    const w = await workspace(page, "Coexisting sources");
    await page.goto(w.base + "/settings/connections");
    await upload(
      page,
      "Sales.csv",
      Buffer.from("Date,Revenue,Expenses\n2026-10-29,2500,900"),
    );
    await page
      .getByRole("button", { name: "Map worksheet pages", exact: false })
      .click();
    await map(page, "CSV");
    await save(page);
    await page
      .getByRole("button", { name: "Connected sources", exact: true })
      .click();
    await page.getByRole("button", { name: "Paste URL", exact: true }).click();
    await page
      .getByLabel("Sheet URL", { exact: true })
      .fill(
        "https://docs.google.com/spreadsheets/d/abcdefghijklmnopqrstuvwx1234/edit",
      );
    await page
      .getByRole("button", { name: "Add shared sheet", exact: true })
      .click();
    await expect(page.locator(".source-parent")).toHaveCount(2);
    await page
      .getByRole("button", { name: "Connect Google", exact: true })
      .click();
    await privateConnect(page, w.base);
    await expect(page.locator(".source-parent")).toHaveCount(3);
    await page
      .getByRole("button", { name: "Upload sheet", exact: true })
      .click();
    await page
      .getByLabel("Upload Excel or CSV file", { exact: true })
      .setInputFiles({
        name: "bad.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: Buffer.from("bad"),
      });
    await expect(page.getByRole("alert")).toBeVisible();
    const report = await (
      await page.request.get(w.api + "/sheets/overview?period=all")
    ).json();
    assert.equal(report.data.tables[0].financial.totals.revenue, 2500);
    await page
      .getByRole("button", { name: "Remove Sales.csv", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove source", exact: true })
      .click();
    await expect(page.locator(".source-parent")).toHaveCount(2);
    await expect(page.locator(".source-inventory")).toContainText(
      "Shared spreadsheet",
    );
  },
);
