import { createRequire } from "node:module";
const requireSource = createRequire(
  new URL(
    "../../aynor-onboarding-frontend/source/package.json",
    import.meta.url,
  ),
);
const { zipSync, strToU8 } = requireSource("fflate");
export function excelFixture(date) {
  const serial = (Date.parse(date) - Date.UTC(1899, 11, 30)) / 86400000;
  const worksheet = (rows) =>
    `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  const text = (ref, value) =>
    `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
  const files = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cover" sheetId="1" r:id="rId1"/><sheet name="Finance" sheetId="2" r:id="rId2"/><sheet name="Other" sheetId="3" r:id="rId3"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      [1, 2, 3]
        .map(
          (i) =>
            `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`,
        )
        .join("") +
      '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml":
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": worksheet(
      `<row r="1">${text("A1", "Business report")}</row>`,
    ),
    "xl/worksheets/sheet2.xml": worksheet(
      `<row r="1">${text("A1", "Monthly report")}</row><row r="2">${text("A2", "Date")}${text("B2", "Revenue")}${text("C2", "Expenses")}</row><row r="3"><c r="A3" s="1"><v>${serial}</v></c><c r="B3"><f>500*2</f><v>1000</v></c><c r="C3"><v>400</v></c></row>`,
    ),
    "xl/worksheets/sheet3.xml": worksheet(
      `<row r="1">${text("A1", "Recorded")}${text("B1", "Income")}${text("C1", "Costs")}</row><row r="2">${text("A2", date)}<c r="B2"><v>2500</v></c><c r="C2"><v>900</v></c></row>`,
    ),
  };
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, content]) => [
          name,
          strToU8(content),
        ]),
      ),
    ),
  );
}

export function tableWorkbookFixture() {
  const { unzipSync } = requireSource("fflate");
  const files = unzipSync(excelFixture("2026-10-29"));
  files["xl/workbook.xml"] = strToU8(
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="QA" sheetId="1" r:id="rId1"/><sheet name="Reference" sheetId="2" r:id="rId2"/></sheets></workbook>',
  );
  const sheet = (rows) =>
    strToU8(
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
        rows
          .map(
            (row, r) =>
              `<row r="${r + 1}">${row.map((value, c) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="inlineStr"><is><t>${value}</t></is></c>`).join("")}</row>`,
          )
          .join("") +
        "</sheetData></worksheet>",
    );
  files["xl/worksheets/sheet1.xml"] = sheet([
    ["ORCA test suite"],
    ["Case ID", "Status", "Run date"],
    ...Array.from({ length: 30 }, (_, i) => [
      `CASE-${i + 1}`,
      i % 2 ? "Failed" : "Passed",
      "29/10/2026",
    ]),
  ]);
  files["xl/worksheets/sheet2.xml"] = sheet([
    ["Case ID", "Owner"],
    ...Array.from({ length: 30 }, (_, i) => [
      `CASE-${i + 1}`,
      "Team " + ((i % 3) + 1),
    ]),
  ]);
  return Buffer.from(zipSync(files));
}
