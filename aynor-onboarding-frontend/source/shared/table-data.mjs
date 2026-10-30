// Shared deterministic profiling. Suggestions never invent business meaning.
export const dataTypes = [
  "text",
  "number",
  "currency",
  "percentage",
  "date",
  "boolean",
];
export function parseNumber(value) {
  let raw = String(value ?? "")
    .trim()
    .replace(/\u00a0/g, " ")
    .replace(/^(USD|EUR|GBP|PKR|INR|AED)\s*/i, "")
    .replace(/[$€£₹₨%]/g, "")
    .trim();
  if (/^\(.*\)$/.test(raw)) raw = "-" + raw.slice(1, -1);
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) return null;
  const n = Number(raw.replaceAll(",", ""));
  return Number.isFinite(n) && Math.abs(n) <= 1e12 ? n : null;
}
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
function namedDate(raw) {
  const text = raw
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, "$1")
    .replace(/,/g, "")
    .replace(/([a-z])\./g, "$1")
    .replace(/[-/]/g, " ")
    .replace(/\s+/g, " ");
  const match =
    text.match(/^([a-z]+) (\d{1,2})(?: (\d{4}))?$/) ||
    text.match(/^(\d{1,2}) ([a-z]+)(?: (\d{4}))?$/);
  if (!match) return null;
  const month = /^\d/.test(match[1]) ? match[2] : match[1];
  const index = months.findIndex(
    (m) =>
      m === month ||
      m.slice(0, 3) === month ||
      (m === "september" && month === "sept"),
  );
  return index < 0
    ? null
    : {
        m: index + 1,
        d: Number(/^\d/.test(match[1]) ? match[1] : match[2]),
        y: match[3],
      };
}
export function isYearlessDate(value) {
  const raw = String(value ?? "").trim();
  const named = namedDate(raw);
  return !!(named && !named.y) || /^\d{1,2}[-/.]\d{1,2}$/.test(raw);
}
export function parseDate(value, format = "ymd", year) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[\u200e\u200f]/g, "");
  if (format === "excel" && /^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (
      !raw ||
      !Number.isFinite(n) ||
      n < 1 ||
      n > 2958465 ||
      Math.floor(n) === 60
    )
      return null;
    return new Date(
      Date.UTC(1899, 11, 30) + (Math.floor(n) + (n < 60 ? 1 : 0)) * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  }
  const clock = raw.match(
    /[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?: ?([AP]M))?/i,
  );
  if (
    clock &&
    (Number(clock[1]) > (clock[4] ? 12 : 23) ||
      (clock[4] && Number(clock[1]) < 1) ||
      Number(clock[2]) > 59 ||
      Number(clock[3] || 0) > 59)
  )
    return null;
  if (raw.includes("T") && !Number.isFinite(Date.parse(raw))) return null;
  let y, m, d;
  const iso = raw.match(
    /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
  );
  const named = namedDate(raw);
  if (iso) [, y, m, d] = iso;
  else if (named) ({ y, m, d } = named);
  else {
    const parts = raw.match(
      /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{4}))?(?: \d{1,2}:\d{2}(?::\d{2})?(?: ?[AP]M)?)?$/i,
    );
    if (!parts || !["dmy", "mdy"].includes(format)) return null;
    y = parts[3];
    m = parts[format === "dmy" ? 2 : 1];
    d = parts[format === "dmy" ? 1 : 2];
  }
  y ||= year;
  if (!/^\d{4}$/.test(String(y)) || Number(y) < 1900 || Number(y) > 9999)
    return null;
  const result = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return Number.isFinite(Date.parse(result)) &&
    new Date(result).toISOString().slice(0, 10) === result
    ? result
    : null;
}
export function suggestHeader(rows) {
  const candidates = rows.slice(0, 30).map((row, index) => {
    const cells = row.filter((v) => String(v ?? "").trim());
    const next =
      rows[index + 1]?.filter((v) => String(v ?? "").trim()).length || 0;
    return {
      index,
      score:
        cells.length < 2
          ? 0
          : cells.filter((v) => typeof v === "string").length +
            Math.min(next, cells.length) +
            new Set(cells).size / cells.length,
    };
  });
  return (
    candidates.sort((a, b) => b.score - a.score || a.index - b.index)[0]
      ?.index || 0
  );
}
export function profileColumns(headers, rows) {
  return headers.map((name, index) => {
    const values = rows
      .map((row) => row[index])
      .filter((v) => String(v ?? "").trim() !== "");
    const sample = values.slice(0, 100);
    let type = "text";
    const all = (fn) => sample.length > 0 && sample.every(fn);
    const ambiguousDate = sample.some((v) =>
      /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(String(v).trim()),
    );
    if (all((v) => parseDate(v) !== null)) type = "date";
    else if (all((v) => /^(true|false|yes|no)$/i.test(String(v))))
      type = "boolean";
    else if (all((v) => parseNumber(v) !== null))
      type = sample.some((v) => /%/.test(String(v)))
        ? "percentage"
        : sample.some((v) =>
              /[$€£₹₨]|^(USD|EUR|GBP|PKR|INR|AED)/i.test(String(v)),
            )
          ? "currency"
          : "number";
    return {
      name,
      type,
      examples: sample.slice(0, 2).map(String),
      missing: rows.length - values.length,
      ambiguousDate,
    };
  });
}
export function validateTable(values, config, columns) {
  const headerRow = config.headerRow ?? 0;
  if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow > 99)
    throw Error("Choose a header row between 1 and 100.");
  if (
    !Array.isArray(values) ||
    values.length > 10101 ||
    values.some(
      (row) =>
        !Array.isArray(row) ||
        row.length > 52 ||
        row.some(
          (cell) =>
            cell !== null &&
            (!["string", "number", "boolean"].includes(typeof cell) ||
              String(cell).length > 10000 ||
              (typeof cell === "number" && !Number.isFinite(cell))),
        ),
    )
  )
    throw Error(
      "Use up to 10,000 records and 52 columns, without oversized cells.",
    );
  if (
    config.endRow !== undefined &&
    (!Number.isInteger(config.endRow) ||
      config.endRow < headerRow + 2 ||
      config.endRow > 10101)
  )
    throw Error(
      "The last data row must be after the column names, up to row 10,101.",
    );
  const sliced = values.slice(headerRow, config.endRow);
  const headers = columns(sliced);
  const records = sliced
    .slice(1)
    .map((row, index) => ({ row, rowNumber: headerRow + index + 2 }))
    .filter(({ row }) => row.some((v) => String(v ?? "").trim()));
  const rows = records.map((record) => record.row);
  if (!rows.length || rows.length > 10000)
    throw Error("Choose a table containing 1 to 10,000 data rows.");
  const types = config.types;
  if (
    !Array.isArray(types) ||
    types.length !== headers.length ||
    types.some((type) => !dataTypes.includes(type) && type !== "ignore")
  )
    throw Error("Review the type for each column.");
  if (!types.some((type) => type !== "ignore"))
    throw Error("Keep at least one column to import.");
  const retained = headers
    .map((name, index) => ({ name, index, type: types[index] }))
    .filter((c) => c.type !== "ignore");
  const normalized = records.map(({ row, rowNumber }) =>
    retained.map((c) => {
      const value = row[c.index];
      if (!String(value ?? "").trim()) return null;
      if (c.type === "text") return String(value);
      if (c.type === "boolean") {
        if (/^(true|yes)$/i.test(String(value))) return true;
        if (/^(false|no)$/i.test(String(value))) return false;
      } else {
        const result =
          c.type === "date"
            ? parseDate(
                value,
                config.dateFormats?.[c.index] || config.dateFormat,
                config.dateYears?.[c.index] || config.dateYear,
              )
            : parseNumber(value);
        if (result !== null) return result;
      }
      throw Error(
        `Row ${rowNumber}, “${c.name}”: “${String(value).slice(0, 60)}” is not ${c.type === "date" ? (isYearlessDate(value) && !config.dateYear ? "a complete date: choose the year for dates without a year" : "a date in your chosen format") : "a valid " + c.type + " value"}. Change its type or date format; your existing report is unchanged.`,
      );
    }),
  );
  return {
    title: String(config.title || "Table").slice(0, 150),
    purpose: [
      "Sales",
      "Finance",
      "Projects",
      "People",
      "Inventory",
      "Testing",
      "Other",
    ].includes(config.purpose)
      ? config.purpose
      : "Other",
    headers: retained.map((c) => c.name),
    types: retained.map((c) => c.type),
    rows: normalized,
    rowCount: normalized.length,
  };
}
// Inspect every row and every field, rather than reporting only the first failure.
export function mappingConflicts(values, config, columns) {
  const headers = columns(values.slice(config.headerRow ?? 0));
  const issues = [];
  let total = 0;
  values.slice((config.headerRow ?? 0) + 1).forEach((row, offset) => {
    headers.forEach((name, column) => {
      const type =
        config.properties?.[column] || config.types?.[column] || "text";
      const value = row[column];
      if (!String(value ?? "").trim() || ["ignore", "text"].includes(type))
        return;
      const valid =
        type === "date"
          ? parseDate(
              value,
              config.dateFormats?.[column] || config.dateFormat,
              config.dateYears?.[column] || config.dateYear,
            ) !== null
          : type === "boolean"
            ? /^(true|false|yes|no)$/i.test(String(value))
            : parseNumber(value) !== null;
      if (!valid) {
        total++;
        if (issues.length < 50)
          issues.push({
            row: offset + (config.headerRow ?? 0) + 2,
            column,
            name,
            value: String(value).slice(0, 100),
            message:
              type === "date" &&
              isYearlessDate(value) &&
              !config.dateYear &&
              !config.dateYears?.[column]
                ? "Choose the year for dates without a year."
                : `Does not match ${type === "date" ? "the selected date format" : type}.`,
          });
      }
    });
  });
  return { issues, total };
}
export function validateRelationships(tables, configs, relationships = []) {
  if (!Array.isArray(relationships) || relationships.length > 20)
    throw Error("Choose up to 20 table connections.");
  return relationships.map((link) => {
    if (!link || typeof link !== "object")
      throw Error("Review your table connections.");
    const from = configs.findIndex((c) => c.tabId === link.from);
    const to = configs.findIndex((c) => c.tabId === link.to);
    if (from < 0 || to < 0 || from === to)
      throw Error("Connect two different selected tables.");
    const a = tables[from].headers.indexOf(link.fromColumn),
      b = tables[to].headers.indexOf(link.toColumn);
    if (a < 0 || b < 0)
      throw Error(
        "A connected column was excluded or renamed. Review the connection.",
      );
    if (tables[from].types[a] !== tables[to].types[b])
      throw Error("Connected columns must have the same type.");
    const keys = tables[to].rows.map((row) => row[b]).filter((v) => v !== null);
    if (new Set(keys.map((v) => JSON.stringify(v))).size !== keys.length)
      throw Error(
        `“${tables[to].title} → ${link.toColumn}” contains duplicate keys. Keep tables separate or choose a unique reference column.`,
      );
    const target = new Set(keys.map((v) => JSON.stringify(v)));
    const matched = tables[from].rows.filter(
      (row) => row[a] !== null && target.has(JSON.stringify(row[a])),
    ).length;
    if (!matched)
      throw Error(
        "These columns have no matching values. Keep the tables separate or choose a different key.",
      );
    return {
      from,
      to,
      fromColumn: link.fromColumn,
      toColumn: link.toColumn,
      matched,
    };
  });
}
export function tableSummary(snapshot) {
  return {
    kind: "tables",
    relationships: snapshot.relationships || [],
    tables: snapshot.tables.map((table) => ({
      ...table,
      rows: table.rows,
      columns: table.headers.map((name, i) => {
        const values = table.rows
          .map((row) => row[i])
          .filter((v) => v !== null);
        const counts = new Map();
        if (["text", "boolean"].includes(table.types[i]))
          for (const value of values)
            counts.set(String(value), (counts.get(String(value)) || 0) + 1);
        return {
          name,
          type: table.types[i],
          filled: values.length,
          missing: table.rowCount - values.length,
          uniqueCount: counts.size,
          categories: [...counts]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([label, count]) => [
              label.length > 160 ? label.slice(0, 157) + "…" : label,
              count,
            ]),
        };
      }),
    })),
  };
}
export function financialCurrency(values, headers, properties, headerRow = 0) {
  const index = headers.findIndex((h) =>
    /^currency(?: code)?$/i.test(h.trim()),
  );
  const currencies = new Set();
  const financialColumns = properties
    .map((p, i) => (["money_in", "money_out"].includes(p) ? i : -1))
    .filter((i) => i >= 0);
  for (const row of values.slice(headerRow + 1)) {
    if (!row.some((v) => String(v ?? "").trim())) continue;
    if (index >= 0) {
      const value = String(row[index] ?? "")
        .trim()
        .toUpperCase();
      if (!/^[A-Z]{3}$/.test(value))
        throw Error(
          "A financial row has a missing or invalid currency code. Keep these amounts as ordinary Currency values until each row has a currency.",
        );
      currencies.add(value);
    }
    for (const i of financialColumns) {
      const raw = String(row[i] ?? "").trim();
      const code = raw
        .match(/^(USD|EUR|GBP|PKR|INR|AED)\b/i)?.[1]
        ?.toUpperCase();
      const symbol = raw.match(/[$€£₹₨]/)?.[0];
      if (code) currencies.add(code);
      else if (symbol && ["€", "£", "₹"].includes(symbol))
        currencies.add({ "€": "EUR", "£": "GBP", "₹": "INR" }[symbol]);
    }
  }
  if (currencies.size > 1)
    throw Error(
      "Financial totals are withheld because this table contains multiple currencies. Keep these columns as Currency, or split the currencies into separate pages. No conversion was assumed.",
    );
  return [...currencies][0];
}
