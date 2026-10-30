// Summaries describe recorded fields; they never turn arbitrary numbers into money
// or claim that a row is a unique business entity across different worksheets.
const normalize = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
const statusName =
  /^(status|state|stage|task status|project status|order status|ticket status|work status|test status|result)$/;
const dueName = /^(due|due date|deadline|target|target date|delivery date)$/;
const groups = {
  completed: new Set([
    "done",
    "complete",
    "completed",
    "closed",
    "resolved",
    "delivered",
    "paid",
    "won",
    "passed",
    "approved",
    "finished",
  ]),
  open: new Set([
    "open",
    "pending",
    "todo",
    "to do",
    "backlog",
    "in progress",
    "in review",
    "review",
    "awaiting approval",
    "not started",
    "active",
    "unpaid",
    "new",
  ]),
  flagged: new Set([
    "blocked",
    "on hold",
    "failed",
    "rejected",
    "overdue",
    "at risk",
  ]),
  cancelled: new Set(["cancelled", "canceled", "lost", "archived", "skipped"]),
};
export function operationalOverview(
  tables,
  today = new Date().toISOString().slice(0, 10),
) {
  const counts = { open: 0, completed: 0, flagged: 0, cancelled: 0, other: 0 };
  const departments = new Map(),
    measures = new Map();
  let records = 0,
    statusRecords = 0,
    overdue = 0,
    hasDeadlines = false;
  const sources = new Set();
  for (const [index, table] of tables.entries()) {
    const rows = table.rows || [],
      headers = table.headers || [],
      types = table.types || [];
    records += rows.length;
    sources.add(table.sourceId || table.parentTitle || `source:${index}`);
    const department = table.department || "Unassigned";
    const team = departments.get(department) || {
      name: department,
      records: 0,
      pages: 0,
      open: 0,
      completed: 0,
      flagged: 0,
    };
    team.records += rows.length;
    team.pages++;
    const status = headers.findIndex((h) => statusName.test(normalize(h)));
    const due = headers.findIndex(
      (h, i) => dueName.test(normalize(h)) && types[i] === "date",
    );
    if (status >= 0 && due >= 0) hasDeadlines = true;
    for (const row of rows) {
      const value = normalize(row[status]);
      if (status < 0 || !value) continue;
      const category =
        Object.keys(groups).find((group) => groups[group].has(value)) ||
        "other";
      counts[category]++;
      statusRecords++;
      if (["open", "completed", "flagged"].includes(category)) team[category]++;
      if (
        due >= 0 &&
        ["open", "flagged"].includes(category) &&
        /^\d{4}-\d{2}-\d{2}$/.test(String(row[due])) &&
        row[due] < today
      )
        overdue++;
    }
    departments.set(department, team);
    headers.forEach((header, column) => {
      const key = normalize(header);
      if (
        types[column] !== "number" ||
        !/^(units|quantity|qty|on hand|stock on hand|inventory quantity|effort hours|weekly hours|hours worked|headcount|attendees|tickets resolved)$/.test(
          key,
        )
      )
        return;
      const values = rows
        .map((r) => r[column])
        .filter((v) => typeof v === "number" && Number.isFinite(v));
      if (!values.length) return;
      const metric = measures.get(key) || {
        name: header,
        total: 0,
        values: 0,
        pages: 0,
      };
      metric.total += values.reduce((a, b) => a + b, 0);
      metric.values += values.length;
      metric.pages++;
      measures.set(key, metric);
    });
  }
  return {
    records,
    workbooks: sources.size,
    pages: tables.length,
    statusRecords,
    counts,
    overdue: hasDeadlines ? overdue : null,
    departments: [...departments.values()].sort(
      (a, b) => b.records - a.records,
    ),
    measures: [...measures.values()]
      .filter(
        (m) =>
          Number.isFinite(m.total) &&
          Math.abs(m.total) <= Number.MAX_SAFE_INTEGER,
      )
      .map((m) => ({ ...m, total: Number(m.total.toPrecision(15)) })),
    previewIndex: Math.max(
      0,
      tables.findIndex((t) =>
        (t.headers || []).some((h) => statusName.test(normalize(h))),
      ),
    ),
  };
}
