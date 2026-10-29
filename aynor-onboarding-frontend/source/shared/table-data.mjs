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
export function parseDate(value, format = "ymd") {
  const raw = String(value ?? "").trim();
  let y, m, d;
  const iso = raw.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:T00:00:00(?:\.000)?Z)?$/,
  );
  if (iso) [, y, m, d] = iso;
  else {
    const parts = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (!parts || !["dmy", "mdy"].includes(format)) return null;
    y = parts[3];
    m = parts[format === "dmy" ? 2 : 1];
    d = parts[format === "dmy" ? 1 : 2];
  }
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
            ? parseDate(value, config.dateFormat)
            : parseNumber(value);
        if (result !== null) return result;
      }
      throw Error(
        `Row ${rowNumber}, “${c.name}”: “${String(value).slice(0, 60)}” is not ${c.type === "date" ? "a date in your chosen format" : "a valid " + c.type + " value"}. Change its type or date format; your existing report is unchanged.`,
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
