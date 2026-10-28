import readExcelFile from "read-excel-file/browser";
import { parseCSV } from "../../../server/sheets-validation.mjs";

// Parse off the UI thread: a workbook must not freeze onboarding interactions.
self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const file = event.data;
    const sheets = file.name.toLowerCase().endsWith(".csv")
      ? [{ sheet: "CSV", data: parseCSV(await file.text()) }]
      : await readExcelFile(file);
    if (!sheets.length || sheets.length > 50)
      throw Error("Choose a workbook with between 1 and 50 worksheets.");
    self.postMessage({
      sheets: sheets.map(({ sheet, data }) => ({
        name: sheet,
        rows: data.map((row) => {
          const cells = row.map((value) =>
            value instanceof Date ? value.toISOString().slice(0, 10) : value,
          );
          while (
            cells.length &&
            (cells[cells.length - 1] === null || cells[cells.length - 1] === "")
          )
            cells.pop();
          return cells;
        }),
      })),
    });
  } catch {
    self.postMessage({
      error:
        "This file could not be read. Save it as an Excel workbook (.xlsx) or UTF-8 CSV, then try again.",
    });
  }
};
