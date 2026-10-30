import { parseDate } from "../shared/table-data.mjs";
export function sheetId(input) {
  if (typeof input !== "string")
    throw Error("Enter a Google Sheets URL or spreadsheet ID.");
  if (/^[a-zA-Z0-9_-]{20,150}$/.test(input)) return input;
  let url;
  try {
    url = new URL(input);
  } catch {
    throw Error("Enter a valid Google Sheets URL.");
  }
  const match = url.pathname.match(
    /^\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,150})(?:\/|$)/,
  );
  if (
    url.protocol !== "https:" ||
    url.hostname !== "docs.google.com" ||
    url.username ||
    url.password ||
    url.port ||
    !match
  )
    throw Error("Use a docs.google.com spreadsheet link.");
  return match[1];
}
export function columns(values) {
  const width = Math.max(0, ...values.map((row) => row.length));
  const headers =
    values[0] && Array.from({ length: width }, (_, i) => values[0][i]);
  if (!Array.isArray(headers) || !headers.length || headers.length > 52)
    throw Error("Use one header row with at most 52 columns.");
  const used = new Set();
  const names = headers.map((value, index) => {
    const base =
      String(value ?? "")
        .trim()
        .slice(0, 130) || `Column ${index + 1}`;
    let name = base,
      suffix = 2;
    while (used.has(name.toLowerCase())) name = `${base} (${suffix++})`;
    used.add(name.toLowerCase());
    return name;
  });
  return names;
}
function amount(value, row, field) {
  let raw = String(value ?? "")
    .trim()
    .replace(/\u00a0/g, " ");
  raw = raw
    .replace(/^(?:USD|EUR|GBP|PKR|INR|AED)\s*/i, "")
    .replace(/[$€£₹₨]/g, "")
    .trim();
  if (/^\(.*\)$/.test(raw)) raw = "-" + raw.slice(1, -1).trim();
  if (!raw || !/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/.test(raw))
    throw Error(
      `Row ${row}: ${field} must be a number; use a decimal point and no currency symbols.`,
    );
  const number = Number(raw.replaceAll(",", ""));
  if (!Number.isFinite(number) || Math.abs(number) > 1e12)
    throw Error(`Row ${row}: ${field} is outside the supported range.`);
  return Math.round(number * 100) / 100;
}
export function validateRows(values, mapping) {
  const offset = Number(mapping._headerRow || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 99)
    throw Error("Choose a valid header row.");
  values = values.slice(offset);
  const headers = columns(values);
  const fields = ["date", "revenue", "expenses"];
  for (const field of ["date", "revenue", "expenses"])
    if (!headers.includes(mapping[field]))
      throw Error(`The mapped ${field} column is missing. Review mapping.`);
  if (new Set(fields.map((key) => mapping[key])).size !== 3)
    throw Error("Map each measure to a different column.");
  if (values.length > 10001)
    throw Error(
      "This tab exceeds 10,000 records. Split the workbook before syncing.",
    );
  const indices = Object.fromEntries(
    fields.map((k) => [k, headers.indexOf(mapping[k])]),
  );
  const days = new Map();
  let count = 0,
    absoluteCents = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!row.some((v) => String(v ?? "").trim())) continue;
    if (
      row.length > headers.length &&
      row.slice(headers.length).some((v) => String(v ?? "").trim())
    )
      throw Error(`Row ${i + 1}: values exist without column headers.`);
    const date = parseDate(
      row[indices.date],
      mapping._dateFormat || "ymd",
      mapping._dateYear,
    );
    if (!date)
      throw Error(
        `Row ${i + offset + 1}: choose the correct date column and date format. Use year-month-day, day-month-year or month-day-year to match your sheet.`,
      );
    const revenue = amount(row[indices.revenue], i + 1, "revenue"),
      costs = amount(row[indices.expenses], i + 1, "expenses");
    absoluteCents +=
      Math.abs(Math.round(revenue * 100)) + Math.abs(Math.round(costs * 100));
    if (!Number.isSafeInteger(absoluteCents))
      throw Error(
        `Row ${i + 1}: combined amounts exceed the supported reporting precision.`,
      );
    const previous = days.get(date) || { date, revenue: 0, costs: 0 };
    previous.revenue += Math.round(revenue * 100);
    previous.costs += Math.round(costs * 100);
    days.set(date, previous);
    count++;
  }
  if (!count)
    throw Error(
      "No data rows are available. Add records below the header row.",
    );
  return {
    rowCount: count,
    points: [...days.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({
        ...p,
        revenue: p.revenue / 100,
        costs: p.costs / 100,
      })),
  };
}
export function aggregate(snapshot, period, now = new Date()) {
  const months = { month: 1, quarter: 3, half: 6, year: 12 }[period];
  if (!months && period !== "all")
    throw Error("Choose month, quarter, half, year or all.");
  const end =
    period === "all"
      ? new Date(
          Date.parse(snapshot.points.at(-1).date + "T00:00:00Z") + 86400000,
        )
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start =
    period === "all"
      ? new Date(snapshot.points[0].date + "T00:00:00Z")
      : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
  const points = snapshot.points.filter(
    (p) =>
      p.date >= start.toISOString().slice(0, 10) &&
      p.date < end.toISOString().slice(0, 10),
  );
  const cents = points.reduce(
    (a, p) => ({
      revenue: a.revenue + Math.round(p.revenue * 100),
      costs: a.costs + Math.round(p.costs * 100),
    }),
    { revenue: 0, costs: 0 },
  );
  const totals = { revenue: cents.revenue / 100, costs: cents.costs / 100 };
  return {
    points,
    totals: {
      ...totals,
      profit: (cents.revenue - cents.costs) / 100,
      margin: totals.revenue
        ? ((totals.revenue - totals.costs) / totals.revenue) * 100
        : null,
    },
    start: start.toISOString().slice(0, 10),
    endExclusive: end.toISOString().slice(0, 10),
    recordsAvailable: snapshot.rowCount,
  };
}
export function publicSheetUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw Error("Paste a published Google Sheets CSV link.");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "docs.google.com" ||
    url.port ||
    url.username ||
    url.password ||
    (!/^\/spreadsheets\/d\/e\/[a-zA-Z0-9_-]{20,200}\/pub$/.test(url.pathname) &&
      !/^\/spreadsheets\/d\/[a-zA-Z0-9_-]{20,150}(?:\/(?:edit|export|view))?\/?$/.test(
        url.pathname,
      ))
  )
    throw Error(
      "Paste a Google Sheets link shared for viewing, or a published CSV link. Use Connect Google for private sheets.",
    );
  const gid =
    url.searchParams.get("gid") ||
    new URLSearchParams(url.hash.slice(1)).get("gid") ||
    "0";
  if (!/^\d{1,12}$/.test(gid)) throw Error("Invalid published tab identifier.");
  if (url.pathname.includes("/d/e/"))
    return `https://docs.google.com${url.pathname}?output=csv&gid=${gid}&single=true`;
  const id = url.pathname.split("/")[3];
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}
export function parseCSV(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (closed && ![",", "\n", "\r"].includes(char))
      throw Error("Invalid CSV: unexpected text after a quoted field.");
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") {
        closed = quoted;
        quoted = !quoted;
      } else throw Error("Invalid CSV quoting.");
    } else if (char === "," && !quoted) {
      row.push(cell);
      closed = false;
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      closed = false;
      cell = "";
      if (rows.length > 10002) throw Error("This tab exceeds 10,000 records.");
    } else cell += char;
  }
  if (quoted) throw Error("Invalid CSV: an escaped field was not closed.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}
