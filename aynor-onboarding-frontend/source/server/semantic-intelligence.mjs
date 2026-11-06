import { createHash } from "node:crypto";
import { dateInTimezone } from "../shared/sync-time.mjs";
// Governed MVP metrics. This module never writes records, calls AI, or changes imports.
export const SEMANTIC_VERSION = 1;
export const purposes = [
  "finance",
  "sales",
  "delivery",
  "resources",
  "marketing",
  "operations",
  "other",
  "reference",
];
export const entities = [
  "transaction",
  "invoice",
  "deal",
  "project",
  "resource",
  "campaign",
  "inventory",
  "other",
];
const aliases = {
  client_name: ["client", "client name", "customer", "customer name"],
  project_name: ["project name", "project title"],
  owner_name: ["owner", "owner name", "account owner", "project owner"],
  resource_name: ["employee name", "resource name", "person name"],
  entity_id: [
    "id",
    "entry id",
    "transaction id",
    "invoice id",
    "deal id",
    "project id",
    "employee id",
    "resource id",
    "campaign id",
    "sku",
    "record",
    "record no",
    "record number",
    "reference",
    "reference no",
    "reference number",
    "emp id",
    "staff id",
    "item id",
  ],
  date: [
    "date",
    "reporting date",
    "transaction date",
    "closed date",
    "close date",
    "start date",
    "snapshot date",
  ],
  revenue: ["revenue", "recognized revenue", "sales revenue"],
  expense: [
    "expenses",
    "expense",
    "operating expenses",
    "operating costs",
    "costs",
    "cost",
  ],
  amount: ["amount", "deal value", "opportunity value"],
  outstanding_amount: [
    "outstanding amount",
    "balance due",
    "outstanding balance",
  ],
  status: [
    "status",
    "stage",
    "state",
    "project status",
    "deal status",
    "invoice status",
  ],
  due_date: ["due date", "deadline", "target date"],
  assigned_hours: ["assigned hours", "allocated hours", "scheduled hours"],
  available_hours: ["available hours", "capacity hours"],
  spend: [
    "spend",
    "ad spend",
    "advertising spend",
    "marketing spend",
    "campaign spend",
  ],
  leads: ["leads", "lead count", "generated leads", "leads generated"],
  qualified_leads: ["qualified leads", "marketing qualified leads"],
  on_hand: [
    "on hand",
    "stock",
    "stock level",
    "stock on hand",
    "quantity on hand",
    "units on hand",
  ],
  reorder_level: ["reorder level", "reorder point", "minimum stock"],
};
const numeric = new Set([
  "revenue",
  "expense",
  "amount",
  "outstanding_amount",
  "assigned_hours",
  "available_hours",
  "spend",
  "leads",
  "qualified_leads",
  "on_hand",
  "reorder_level",
]);
const currencies = new Set(Intl.supportedValuesOf("currency"));
const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
const plain = (v) =>
  !!v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const ownKeys = (v, allowed) =>
  Object.keys(v).every((key) => allowed.includes(key));
const error = (message) => {
  throw Object.assign(Error(message), { status: 400 });
};
const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(value + "T00:00:00Z");
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
const signatures = {
  finance: [
    ["revenue", "expense", "date"],
    ["outstanding_amount", "due_date", "status"],
  ],
  sales: [["amount", "status", "date"]],
  delivery: [["entity_id", "status", "due_date"]],
  resources: [["entity_id", "assigned_hours", "available_hours"]],
  marketing: [["entity_id", "date", "spend", "leads"]],
  operations: [["entity_id", "date", "on_hand", "reorder_level"]],
};
export function validateSemanticSettings(input) {
  if (
    !plain(input) ||
    !ownKeys(input, ["fieldAliases", "freshnessHours", "enabledMetrics"])
  )
    error("Review semantic settings.");
  const result = { fieldAliases: {}, freshnessHours: 48 };
  if (input.freshnessHours !== undefined) {
    if (
      !Number.isInteger(input.freshnessHours) ||
      input.freshnessHours < 1 ||
      input.freshnessHours > 8760
    )
      error("Freshness must be 1–8760 hours.");
    result.freshnessHours = input.freshnessHours;
  }
  if (input.fieldAliases !== undefined) {
    if (
      !plain(input.fieldAliases) ||
      !ownKeys(input.fieldAliases, Object.keys(aliases))
    )
      error("Unknown semantic field alias.");
    for (const [field, labels] of Object.entries(input.fieldAliases)) {
      if (
        !Array.isArray(labels) ||
        labels.length > 20 ||
        labels.some((v) => typeof v !== "string" || !v.trim() || v.length > 100)
      )
        error("Use up to 20 short labels per field.");
      result.fieldAliases[field] = [...new Set(labels.map(normalize))];
    }
  }
  if (input.enabledMetrics !== undefined) {
    if (
      !Array.isArray(input.enabledMetrics) ||
      input.enabledMetrics.some(
        (id) => !metricRegistry.some((m) => m.id === id),
      )
    )
      error("Unknown metric identifier.");
    result.enabledMetrics = [...new Set(input.enabledMetrics)];
  }
  return result;
}
function dataVersion(table) {
  return createHash("sha256").update(JSON.stringify(table.rows)).digest("hex");
}
export function schemaOf(table) {
  return JSON.stringify([table.headers || [], table.types || []]);
}
export function proposeSemantics(table, settings = {}, hints = {}) {
  const fields = {},
    ambiguous = [];
  for (const [field, names] of Object.entries(aliases)) {
    const matches = (table.headers || []).filter(
      (header, i) =>
        [...names, ...(settings.fieldAliases?.[field] || [])].includes(
          normalize(header),
        ) &&
        (numeric.has(field)
          ? ["number", "currency"].includes(table.types?.[i])
          : ["date", "due_date"].includes(field)
            ? table.types?.[i] === "date"
            : field.endsWith("_name")
              ? table.types?.[i] === "text"
              : ["text", "number"].includes(table.types?.[i])),
    );
    if (matches.length === 1) fields[field] = matches[0];
    else if (matches.length > 1) ambiguous.push(field);
  }
  // Reuse explicit column mapping instead of asking the user to map the same
  // business fields twice. These hints can propose, but never confirm, meaning.
  const mapped = { date: "date", money_in: "revenue", money_out: "expense" };
  for (const [property, field] of Object.entries(mapped)) {
    const indexes = (hints.properties || [])
      .map((value, index) => (value === property ? index : -1))
      .filter((index) => index >= 0 && index < table.headers.length);
    if (indexes.length === 1 && !fields[field])
      fields[field] = table.headers[indexes[0]];
  }
  // Purpose requires a field signature and populated values, never the sheet name.
  const candidates = Object.entries(signatures)
    .filter(([, patterns]) =>
      patterns.some((pattern) => pattern.every((f) => fields[f])),
    )
    .map(([name]) => name);
  const values = (table.rows || [])
    .flat()
    .filter((v) => v !== null)
    .slice(0, 200);
  const referenceEvidence = values.filter(
    (v) =>
      typeof v === "string" &&
      /\b(instructions?|step \d|click|read me|getting started|how to|do not edit)\b/i.test(
        v,
      ),
  ).length;
  const instructionalTitle =
    /^(start here|read me|instructions?|getting started|setup guide)$/i.test(
      String(hints.title || "").trim(),
    );
  const purpose =
    instructionalTitle || referenceEvidence >= 2
      ? "reference"
      : values.length && candidates.length === 1
        ? candidates[0]
        : "other";
  const currencyIndex = table.headers.findIndex((header) =>
    /^currency(?: code)?$/i.test(String(header).trim()),
  );
  const explicitCurrencies = new Set(
    currencyIndex < 0
      ? []
      : table.rows
          .map((row) =>
            String(row[currencyIndex] || "")
              .trim()
              .toUpperCase(),
          )
          .filter((value) => currencies.has(value)),
  );
  return {
    version: SEMANTIC_VERSION,
    purpose,
    fields,
    state: "provisional",
    evidence: {
      matchedFields: Object.keys(fields),
      ambiguousFields: ambiguous,
      candidates,
      referenceEvidence,
      instructionalTitle,
    },
    currency:
      table.currency ||
      (explicitCurrencies.size === 1 ? [...explicitCurrencies][0] : null),
    requiresConfirmation: true,
  };
}
export function confirmSemantics(input, table, actor, now = Date.now()) {
  if (
    !plain(input) ||
    !ownKeys(input, [
      "purpose",
      "label",
      "identityMode",
      "entity",
      "entityNamespace",
      "fields",
      "currency",
      "period",
      "statusValues",
      "enabled",
    ])
  )
    error("Review the semantic mapping.");
  if (!purposes.includes(input.purpose) || !entities.includes(input.entity))
    error("Choose a supported worksheet purpose and entity.");
  if (
    typeof input.entityNamespace !== "string" ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,79}$/.test(input.entityNamespace)
  )
    error(
      "Choose a stable entity namespace (1–80 letters, digits, dots, colons or dashes).",
    );
  if (!plain(input.fields) || !ownKeys(input.fields, Object.keys(aliases)))
    error("Choose supported semantic fields.");
  if (
    input.label !== undefined &&
    (typeof input.label !== "string" ||
      !input.label.trim() ||
      input.label.length > 100)
  )
    error("Use a reporting name of up to 100 characters.");
  const dateIdentity = input.identityMode === "reporting_date";
  if (
    input.identityMode !== undefined &&
    !["identifier", "reporting_date"].includes(input.identityMode)
  )
    error("Review the record identity.");
  if (
    dateIdentity &&
    (input.purpose !== "finance" ||
      input.entity !== "transaction" ||
      !input.fields.date ||
      input.fields.entity_id !== input.fields.date)
  )
    error(
      "One record per date is supported only for confirmed financial reporting dates.",
    );
  const bound = new Set();
  for (const [field, header] of Object.entries(input.fields)) {
    const index = table.headers.indexOf(header);
    if (
      typeof header !== "string" ||
      index < 0 ||
      (bound.has(header) &&
        !(
          dateIdentity &&
          ["entity_id", "date"].includes(field) &&
          input.fields.entity_id === header &&
          input.fields.date === header
        ))
    )
      error("Bind each field to a different existing column.");
    bound.add(header);
    if (
      numeric.has(field) &&
      !["number", "currency"].includes(table.types[index])
    )
      error("Amount and hours fields need numeric columns.");
    if (["date", "due_date"].includes(field) && table.types[index] !== "date")
      error("Date meanings require validated date columns.");
    if (
      field === "entity_id" &&
      !["text", "number", ...(dateIdentity ? ["date"] : [])].includes(
        table.types[index],
      )
    )
      error("Identifiers require text or number columns.");
    if (field.endsWith("_name") && table.types[index] !== "text")
      error("Evidence names require validated text columns.");
    if (field === "status" && table.types[index] !== "text")
      error("Status meanings require text columns.");
  }
  const currency = input.currency || null;
  if (currency && (typeof currency !== "string" || !currencies.has(currency)))
    error("Use a supported uppercase currency code.");
  const period = input.period;
  if (!plain(period) || !["interval", "snapshot"].includes(period.kind))
    error("Confirm a reporting interval or snapshot date.");
  if (period.kind === "interval") {
    if (
      !ownKeys(period, ["kind", "start", "endExclusive"]) ||
      !validDate(period.start) ||
      !validDate(period.endExclusive) ||
      period.start >= period.endExclusive
    )
      error("Use a valid reporting interval with an exclusive end date.");
  } else if (!ownKeys(period, ["kind", "asOf"]) || !validDate(period.asOf))
    error("Use a valid snapshot date.");
  const statusValues = {};
  if (input.statusValues !== undefined) {
    if (
      !plain(input.statusValues) ||
      !ownKeys(input.statusValues, ["active", "closed", "won", "lost"])
    )
      error("Use supported status groups.");
    const seen = new Set();
    for (const [group, labels] of Object.entries(input.statusValues)) {
      if (
        !Array.isArray(labels) ||
        labels.length > 30 ||
        labels.some((v) => typeof v !== "string" || !v.trim() || v.length > 100)
      )
        error("Use up to 30 short labels per status group.");
      statusValues[group] = labels.map(normalize);
      for (const label of statusValues[group]) {
        if (seen.has(label))
          error("A status value cannot belong to multiple groups.");
        seen.add(label);
      }
    }
  }
  if (input.enabled !== undefined && typeof input.enabled !== "boolean")
    error("Enabled must be true or false.");
  return {
    version: SEMANTIC_VERSION,
    purpose: input.purpose,
    label: input.label?.trim() || null,
    identityMode: dateIdentity ? "reporting_date" : "identifier",
    entity: input.entity,
    entityNamespace: input.entityNamespace,
    fields: { ...input.fields },
    currency,
    period: { ...period },
    statusValues,
    enabled: input.enabled !== false,
    schema: schemaOf(table),
    confirmedDataVersion: dataVersion(table),
    confirmedBy: actor,
    confirmedAt: now,
  };
}

const addDay = (value) =>
  new Date(Date.parse(value + "T00:00:00Z") + 86400000)
    .toISOString()
    .slice(0, 10);

// Promote only deterministic mappings. Custom terminology and ambiguous data
// remain proposals until a person confirms them.
export function automaticallyConfirmSemantics(
  table,
  { sourceId, tabId, title, properties, timezone = "UTC", now = Date.now() },
) {
  const proposal = proposeSemantics(table, {}, { title, properties });
  if (
    proposal.evidence.ambiguousFields.length ||
    ![
      "finance",
      "sales",
      "delivery",
      "resources",
      "marketing",
      "operations",
    ].includes(proposal.purpose)
  )
    return null;
  const entity =
    proposal.purpose === "finance"
      ? proposal.fields.outstanding_amount
        ? "invoice"
        : "transaction"
      : proposal.purpose === "sales"
        ? "deal"
        : proposal.purpose === "delivery"
          ? "project"
          : proposal.purpose === "resources"
            ? "resource"
            : proposal.purpose === "marketing"
              ? "campaign"
              : "inventory";
  const required =
    entity === "transaction"
      ? ["entity_id", "date", "revenue", "expense"]
      : entity === "invoice"
        ? ["entity_id", "due_date", "outstanding_amount", "status"]
        : entity === "deal"
          ? ["entity_id", "date", "amount", "status"]
          : entity === "project"
            ? ["entity_id", "status", "due_date"]
            : entity === "resource"
              ? ["entity_id", "assigned_hours", "available_hours"]
              : entity === "campaign"
                ? ["entity_id", "date", "spend", "leads"]
                : ["entity_id", "date", "on_hand", "reorder_level"];
  // A common finance export has one row per reporting date and no separate ID.
  // A unique, complete validated date is a stable identity for that narrow
  // shape; it must never be applied to other purposes or repeated dates.
  if (
    entity === "transaction" &&
    !proposal.fields.entity_id &&
    proposal.fields.date
  ) {
    const dateIndex = table.headers.indexOf(proposal.fields.date);
    const dates = table.rows.map((row) => row[dateIndex]);
    if (
      dates.length &&
      dates.every(validDate) &&
      new Set(dates).size === dates.length
    )
      proposal.fields.entity_id = proposal.fields.date;
  }
  if (required.some((field) => !proposal.fields[field])) return null;
  const idIndex = table.headers.indexOf(proposal.fields.entity_id);
  const ids = table.rows.map((row) => row[idIndex]);
  if (
    !ids.length ||
    ids.some((id) => id === null || id === undefined || !String(id).trim()) ||
    new Set(ids.map((id) => JSON.stringify(id))).size !== ids.length
  )
    return null;
  const needsCurrency = ["transaction", "invoice", "deal", "campaign"].includes(
    entity,
  );
  if (needsCurrency && !proposal.currency) return null;
  const dateIndex = proposal.fields.date
    ? table.headers.indexOf(proposal.fields.date)
    : -1;
  const dates =
    dateIndex < 0
      ? []
      : table.rows.map((row) => row[dateIndex]).filter(validDate);
  if (dateIndex >= 0 && dates.length !== table.rows.length) return null;
  // Inventory is a point-in-time measure. Combining rows from different
  // snapshots would overstate stock, so leave mixed snapshots for review.
  if (entity === "inventory" && new Set(dates).size !== 1) return null;
  const period = ["transaction", "deal", "resource", "campaign"].includes(
    entity,
  )
    ? dates.length
      ? {
          kind: "interval",
          start: [...dates].sort()[0],
          endExclusive: addDay([...dates].sort().at(-1)),
        }
      : null
    : {
        kind: "snapshot",
        asOf: entity === "inventory" ? dates[0] : dateInTimezone(timezone, now),
      };
  if (!period) return null;
  const statusValues = {};
  if (proposal.fields.status) {
    const index = table.headers.indexOf(proposal.fields.status);
    const observed = [
      ...new Set(table.rows.map((row) => normalize(row[index]))),
    ];
    const groups = {
      won: new Set(["won", "signed", "closed won"]),
      lost: new Set(["lost", "cancelled", "canceled", "dropped"]),
      active: new Set([
        "active",
        "open",
        "in progress",
        "negotiation",
        "qualified",
        "blocked",
        "unpaid",
        "overdue",
      ]),
      closed: new Set(["closed", "completed", "paid", "settled"]),
    };
    for (const value of observed) {
      const group = Object.entries(groups).find(([, values]) =>
        values.has(value),
      );
      if (!group) return null;
      (statusValues[group[0]] ||= []).push(value);
    }
    if (entity === "deal" && !statusValues.won?.length) return null;
    if (["invoice", "project"].includes(entity) && !statusValues.active?.length)
      return null;
  }
  try {
    return confirmSemantics(
      {
        purpose: proposal.purpose,
        label: title || proposal.purpose,
        entity,
        entityNamespace: `auto:${sourceId}:${tabId}`.slice(0, 80),
        ...(entity === "transaction" &&
        proposal.fields.entity_id === proposal.fields.date
          ? { identityMode: "reporting_date" }
          : {}),
        fields: proposal.fields,
        currency: needsCurrency ? proposal.currency : null,
        period,
        statusValues,
        enabled: true,
      },
      table,
      "automatic",
      now,
    );
  } catch {
    return null;
  }
}
const definition = (
  id,
  name,
  purpose,
  entity,
  fields,
  unit,
  formula,
  periodKind,
  operation,
) => ({
  id,
  name,
  purpose,
  entity,
  requiredFields: fields,
  unit,
  formula,
  businessMeaning: name,
  applicableModels: ["services", "software", "saas", "other"],
  periodKind,
  aggregation:
    "One confirmed table; unique entity identifiers; no implicit cross-table aggregation",
  operation,
});
export const metricRegistry = [
  definition(
    "finance.revenue",
    "Recognized revenue",
    "finance",
    "transaction",
    ["entity_id", "date", "revenue"],
    "currency",
    "Sum of confirmed recognized revenue",
    "interval",
    "revenue",
  ),
  definition(
    "finance.expenses",
    "Operating expenses",
    "finance",
    "transaction",
    ["entity_id", "date", "expense"],
    "currency",
    "Sum of confirmed operating expenses",
    "interval",
    "expense",
  ),
  definition(
    "finance.profit",
    "Operating profit",
    "finance",
    "transaction",
    ["entity_id", "date", "revenue", "expense"],
    "currency",
    "Recognized revenue minus operating expenses",
    "interval",
    "profit",
  ),
  definition(
    "finance.margin",
    "Operating margin",
    "finance",
    "transaction",
    ["entity_id", "date", "revenue", "expense"],
    "percent",
    "(Recognized revenue minus operating expenses) / recognized revenue × 100",
    "interval",
    "margin",
  ),
  definition(
    "finance.overdue_receivables",
    "Overdue receivables",
    "finance",
    "invoice",
    ["entity_id", "due_date", "outstanding_amount", "status"],
    "currency",
    "Sum of outstanding balances on active invoices due before snapshot date",
    "snapshot",
    "receivables",
  ),
  definition(
    "sales.won_value",
    "Won deal value",
    "sales",
    "deal",
    ["entity_id", "date", "amount", "status"],
    "currency",
    "Sum of confirmed won deal amounts closed in reporting interval; not revenue",
    "interval",
    "won_value",
  ),
  definition(
    "sales.won_deals",
    "Won deals",
    "sales",
    "deal",
    ["entity_id", "date", "status"],
    "count",
    "Count of unique deals with a confirmed won status closed in reporting interval",
    "interval",
    "won_count",
  ),
  definition(
    "delivery.active_projects",
    "Active projects",
    "delivery",
    "project",
    ["entity_id", "status"],
    "count",
    "Count of unique projects with a confirmed active status at snapshot date",
    "snapshot",
    "active",
  ),
  definition(
    "delivery.overdue_projects",
    "Overdue projects",
    "delivery",
    "project",
    ["entity_id", "status", "due_date"],
    "count",
    "Count of active projects with due date before snapshot date; not a forecast",
    "snapshot",
    "overdue",
  ),
  definition(
    "resources.utilization",
    "Planned resource utilization",
    "resources",
    "resource",
    ["entity_id", "assigned_hours", "available_hours"],
    "percent",
    "Sum of assigned hours / sum of available hours × 100 for the same confirmed interval; not actual utilization",
    "interval",
    "utilization",
  ),
  definition(
    "marketing.spend",
    "Campaign spend",
    "marketing",
    "campaign",
    ["entity_id", "date", "spend"],
    "currency",
    "Sum of confirmed campaign spend in the reporting interval",
    "interval",
    "marketing_spend",
  ),
  definition(
    "marketing.leads",
    "Generated leads",
    "marketing",
    "campaign",
    ["entity_id", "date", "leads"],
    "count",
    "Sum of recorded leads across unique campaigns in the reporting interval",
    "interval",
    "leads",
  ),
  definition(
    "marketing.qualified_leads",
    "Qualified leads",
    "marketing",
    "campaign",
    ["entity_id", "date", "qualified_leads"],
    "count",
    "Sum of recorded qualified leads across unique campaigns in the reporting interval",
    "interval",
    "qualified_leads",
  ),
  definition(
    "operations.on_hand",
    "Units on hand",
    "operations",
    "inventory",
    ["entity_id", "on_hand"],
    "count",
    "Sum of recorded on-hand units across unique inventory items at the snapshot date",
    "snapshot",
    "on_hand",
  ),
  definition(
    "operations.reorder_items",
    "Items below reorder level",
    "operations",
    "inventory",
    ["entity_id", "on_hand", "reorder_level"],
    "count",
    "Count of unique inventory items whose on-hand units are below their recorded reorder level",
    "snapshot",
    "reorder_items",
  ),
];
export function evaluateSemantics({
  catalog,
  companyId,
  settings = {},
  now = Date.now(),
  timezone = "UTC",
}) {
  const results = [],
    worksheets = [];
  const asOf = dateInTimezone(timezone, now);
  const all = catalog.sources.flatMap((source) =>
    source.tabs
      .filter((tab) => tab.table)
      .map((tab) => ({
        source,
        tab,
        proposal: proposeSemantics(tab.table, settings, {
          title: tab.title,
          properties: tab.config?.properties,
        }),
        semantic:
          tab.semantic ||
          automaticallyConfirmSemantics(tab.table, {
            sourceId: source.id,
            tabId: tab.tabId,
            title: tab.title,
            properties: tab.config?.properties,
            timezone,
            now,
          }),
      })),
  );
  // Shared namespaces are opt-in. Overlap is blocked rather than guessed/deduplicated.
  const identities = new Map(),
    overlapping = new Set();
  for (const { source, tab, semantic: s } of all) {
    if (
      !s?.fields.entity_id ||
      s.version !== SEMANTIC_VERSION ||
      !s.enabled ||
      tab.skipped ||
      ["reference", "other"].includes(s.purpose) ||
      s.schema !== schemaOf(tab.table)
    )
      continue;
    const index = tab.table.headers.indexOf(s.fields.entity_id);
    for (const row of tab.table.rows) {
      const key = JSON.stringify([s.entity, s.entityNamespace, row[index]]),
        owner = `${source.id}:${tab.tabId}`;
      if (identities.has(key) && identities.get(key) !== owner) {
        overlapping.add(owner);
        overlapping.add(identities.get(key));
      } else identities.set(key, owner);
    }
  }
  for (const { source, tab, semantic: s, proposal } of all) {
    const table = tab.table,
      scope = `${source.id}:${tab.tabId}`;
    const confirmed =
      s?.version === SEMANTIC_VERSION && s.schema === schemaOf(table);
    worksheets.push({
      sourceId: source.id,
      tabId: tab.tabId,
      proposal,
      availableFields: table.headers.map((name, index) => ({
        name,
        type: table.types[index],
        values:
          table.types[index] === "text"
            ? [
                ...new Set(
                  table.rows
                    .map((r) => r[index])
                    .filter((v) => v !== null)
                    .map(String),
                ),
              ].slice(0, 30)
            : [],
      })),
      dateRange: (() => {
        const dates = table.rows
          .flatMap((row) =>
            row.filter(
              (v, index) => table.types[index] === "date" && validDate(v),
            ),
          )
          .sort();
        return dates.length
          ? {
              start: dates[0],
              endExclusive: new Date(
                Date.parse(dates.at(-1) + "T00:00:00Z") + 86400000,
              )
                .toISOString()
                .slice(0, 10),
            }
          : null;
      })(),
      department: tab.department || null,
      confirmation: s || null,
      state: confirmed ? "confirmed" : "provisional",
      executiveEligible: !!(
        confirmed &&
        s.enabled &&
        !["reference", "other"].includes(s.purpose) &&
        !tab.skipped
      ),
    });
    const proposedEntity =
      proposal.purpose === "finance"
        ? proposal.fields.outstanding_amount
          ? "invoice"
          : "transaction"
        : proposal.purpose === "sales"
          ? "deal"
          : proposal.purpose === "delivery"
            ? "project"
            : proposal.purpose === "resources"
              ? "resource"
              : proposal.purpose === "marketing"
                ? "campaign"
                : proposal.purpose === "operations"
                  ? "inventory"
                  : "other";
    const defs = metricRegistry.filter(
      (m) =>
        m.purpose === (s?.purpose || proposal.purpose) &&
        m.entity === (s?.entity || proposedEntity) &&
        (m.id !== "marketing.qualified_leads" ||
          !!(s?.fields.qualified_leads || proposal.fields.qualified_leads)) &&
        (!settings.enabledMetrics || settings.enabledMetrics.includes(m.id)),
    );
    for (const metric of defs) {
      const result = {
        metricId: metric.id,
        name: metric.name,
        definition: metric.formula,
        aggregation: metric.aggregation,
        companyId,
        scope,
        department: tab.department || null,
        entity: s?.entity || null,
        entityNamespace: s?.entityNamespace || null,
        unit: metric.unit,
        currency:
          metric.unit === "currency" ||
          ["profit", "margin"].includes(metric.operation)
            ? s?.currency || null
            : null,
        period: s?.period || null,
        timezone,
        state: "provisional",
        value: null,
        reasons: [],
        completeness: 0,
        confidence: "unconfirmed",
        freshness: {
          lastSuccess: tab.lastSuccess || null,
          evaluatedAt: now,
          maxAgeHours: settings.freshnessHours || 48,
        },
        lineage: {
          sourceId: source.id,
          tabId: tab.tabId,
          fields: s?.fields || {},
          snapshotRevision: catalog.revision || null,
          rowReference: "normalized snapshot row index (zero-based)",
          contributingRows: [],
        },
      };
      const block = (state, reason) => {
        result.state = state;
        result.reasons.push(reason);
        results.push(result);
      };
      if (
        !confirmed ||
        !s.enabled ||
        tab.skipped ||
        ["reference", "other"].includes(s.purpose)
      ) {
        block(
          "provisional",
          "Confirm worksheet purpose and field meanings before calculating metrics.",
        );
        continue;
      }
      if (s.entity !== metric.entity) {
        block(
          "unavailable",
          "This metric requires a different confirmed business entity.",
        );
        continue;
      }
      if (tab.error) {
        block(
          "stale",
          "Source refresh failed; last imported records remain accessible.",
        );
        continue;
      }
      if (!s.fields.date && s.confirmedDataVersion !== dataVersion(table)) {
        block(
          "provisional",
          "Records changed without a reporting-date field. Reconfirm the table's reporting scope; saved field meanings are retained.",
        );
        continue;
      }
      const missing = metric.requiredFields.filter((field) => !s.fields[field]);
      result.completeness =
        (metric.requiredFields.length - missing.length) /
        metric.requiredFields.length;
      if (missing.length) {
        block(
          "insufficient_data",
          `Missing confirmed fields: ${missing.join(", ")}.`,
        );
        continue;
      }
      if (
        s.period.kind !== metric.periodKind ||
        (s.period.kind === "snapshot" && s.period.asOf > asOf)
      ) {
        block(
          "provisional",
          "Confirm a compatible reporting period; future snapshots are unsupported.",
        );
        continue;
      }
      if (
        (metric.unit === "currency" || metric.operation === "margin") &&
        !s.currency
      ) {
        block(
          "insufficient_data",
          "Confirm one currency; no company default or conversion is assumed.",
        );
        continue;
      }
      // Existing ingestion has already checked currency metadata where available.
      if (s.currency && table.currency && s.currency !== table.currency) {
        block(
          "provisional",
          "Confirmed currency conflicts with the imported currency.",
        );
        continue;
      }
      if (
        s.currency &&
        (s.observation?.conflict ||
          s.observation?.currencies.some((currency) => currency !== s.currency))
      ) {
        block(
          "provisional",
          "Original source cells contain mixed or incompatible currency evidence.",
        );
        continue;
      }
      const currencyColumns = table.headers
        .map((h, i) => (/^(currency|currency code)$/i.test(h.trim()) ? i : -1))
        .filter((i) => i >= 0);
      if (
        s.currency &&
        currencyColumns.some((i) =>
          table.rows.some(
            (r) =>
              r[i] !== null && String(r[i]).trim().toUpperCase() !== s.currency,
          ),
        )
      ) {
        block(
          "provisional",
          "Source currency codes are mixed or conflict with the confirmed currency.",
        );
        continue;
      }
      const indices = Object.fromEntries(
        Object.entries(s.fields).map(([f, h]) => [f, table.headers.indexOf(h)]),
      );
      if (
        s.observation?.identifierLoss ||
        table.rows.some(
          (row) =>
            typeof row[indices.entity_id] === "number" &&
            !Number.isSafeInteger(row[indices.entity_id]),
        )
      ) {
        block(
          "provisional",
          "Identifier precision or leading zeros were lost during numeric import. Preserve identifiers as text before confirming them.",
        );
        continue;
      }
      const seen = new Set();
      if (
        overlapping.has(scope) ||
        table.rows.some((r) => {
          const id = r[indices.entity_id],
            key = JSON.stringify(id);
          if (
            id === null ||
            id === undefined ||
            String(id).trim() === "" ||
            seen.has(key)
          )
            return true;
          seen.add(key);
          return false;
        })
      ) {
        block(
          "provisional",
          "Missing, duplicate or overlapping entity identifiers require review; no automatic deduplication was applied.",
        );
        continue;
      }
      const statusGroups = s.statusValues || {};
      const needsStatus = metric.requiredFields.includes("status");
      const targetGroup = metric.operation.startsWith("won") ? "won" : "active";
      const known = new Set(Object.values(statusGroups).flat());
      if (
        needsStatus &&
        (!statusGroups[targetGroup]?.length ||
          table.rows.some((r) => !known.has(normalize(r[indices.status]))))
      ) {
        block(
          "provisional",
          "Confirm all status meanings, including the statuses used by this metric.",
        );
        continue;
      }
      let rows = table.rows.map((row, index) => ({ row, index }));
      if (metric.periodKind === "interval" && s.fields.date) {
        if (rows.some(({ row }) => !validDate(row[indices.date]))) {
          block("insufficient_data", "Missing or invalid reporting dates.");
          continue;
        }
        rows = rows.filter(
          ({ row }) =>
            row[indices.date] >= s.period.start &&
            row[indices.date] < s.period.endExclusive,
        );
      }
      if (!rows.length) {
        block(
          "insufficient_data",
          "No records in the confirmed reporting period.",
        );
        continue;
      }
      if (
        rows.some(({ row }) =>
          metric.requiredFields.some((f) =>
            numeric.has(f)
              ? typeof row[indices[f]] !== "number" ||
                !Number.isFinite(row[indices[f]])
              : f === "due_date"
                ? !validDate(row[indices[f]])
                : row[indices[f]] === null || row[indices[f]] === undefined,
          ),
        )
      ) {
        block(
          "insufficient_data",
          "Required metric inputs contain missing or invalid values.",
        );
        continue;
      }
      if (needsStatus)
        rows = rows.filter(({ row }) =>
          statusGroups[targetGroup].includes(normalize(row[indices.status])),
        );
      if (["receivables", "overdue"].includes(metric.operation))
        rows = rows.filter(({ row }) => row[indices.due_date] < s.period.asOf);
      const monetaryFields = metric.requiredFields.filter((f) =>
        [
          "revenue",
          "expense",
          "amount",
          "outstanding_amount",
          "spend",
        ].includes(f),
      );
      const scale = s.currency
        ? 10 **
          new Intl.NumberFormat("en", {
            style: "currency",
            currency: s.currency,
          }).resolvedOptions().maximumFractionDigits
        : 1;
      const absoluteMinorUnits = rows.reduce(
        (total, { row }) =>
          total +
          monetaryFields.reduce(
            (n, f) => n + Math.abs(Math.round(row[indices[f]] * scale)),
            0,
          ),
        0,
      );
      if (
        !Number.isSafeInteger(absoluteMinorUnits) ||
        rows.some(({ row }) =>
          monetaryFields.some(
            (f) =>
              Math.abs(
                row[indices[f]] * scale - Math.round(row[indices[f]] * scale),
              ) > 0.000001,
          ),
        )
      ) {
        block(
          "unavailable",
          "Amounts exceed safe precision or the confirmed currency's minor units; no rounding was assumed.",
        );
        continue;
      }
      const sum = (f) =>
        monetaryFields.includes(f)
          ? rows.reduce(
              (n, { row }) => n + Math.round(row[indices[f]] * scale),
              0,
            ) / scale
          : rows.reduce((n, { row }) => n + row[indices[f]], 0);
      let value;
      if (["revenue", "expense"].includes(metric.operation))
        value = sum(metric.operation);
      else if (metric.operation === "profit")
        value = sum("revenue") - sum("expense");
      else if (metric.operation === "margin")
        value =
          sum("revenue") === 0
            ? null
            : ((sum("revenue") - sum("expense")) / sum("revenue")) * 100;
      else if (metric.operation === "won_value") value = sum("amount");
      else if (metric.operation === "marketing_spend") value = sum("spend");
      else if (
        ["leads", "qualified_leads", "on_hand"].includes(metric.operation)
      )
        value = sum(metric.operation);
      else if (metric.operation === "reorder_items")
        value = rows.filter(
          ({ row }) => row[indices.on_hand] < row[indices.reorder_level],
        ).length;
      else if (metric.operation === "receivables")
        value = rows.some(({ row }) => row[indices.outstanding_amount] < 0)
          ? null
          : sum("outstanding_amount");
      else if (metric.operation === "utilization")
        value =
          rows.some(
            ({ row }) =>
              row[indices.assigned_hours] < 0 ||
              row[indices.available_hours] < 0,
          ) || sum("available_hours") <= 0
            ? null
            : (sum("assigned_hours") / sum("available_hours")) * 100;
      else value = rows.length;
      if (
        value === null ||
        !Number.isFinite(value) ||
        Math.abs(value) > Number.MAX_SAFE_INTEGER
      ) {
        block(
          "unavailable",
          "Inputs do not support a finite result with a nonzero denominator and safe precision.",
        );
        continue;
      }
      // Snapshot dates and refresh times are distinct; refreshing old snapshots cannot make them current.
      if (
        tab.error ||
        !tab.lastSuccess ||
        now - tab.lastSuccess > (settings.freshnessHours || 48) * 3600000 ||
        (s.period.kind === "snapshot" &&
          Date.parse(asOf + "T00:00:00Z") -
            Date.parse(s.period.asOf + "T00:00:00Z") >
            (settings.freshnessHours || 48) * 3600000)
      ) {
        block(
          "stale",
          "Source data or snapshot date needs refresh; last imported records remain accessible.",
        );
        continue;
      }
      result.state = "validated";
      result.value = Number(value.toPrecision(15));
      result.confidence = "confirmed";
      result.lineage.contributingRows = rows.map(({ index }) => index);
      results.push(result);
    }
  }
  return {
    version: SEMANTIC_VERSION,
    companyId,
    evaluatedAt: now,
    registry: metricRegistry.map(({ operation, ...m }) => m),
    worksheets: worksheets.map((worksheet) => ({
      ...worksheet,
      executiveEligible:
        worksheet.executiveEligible &&
        results.some(
          (metric) =>
            metric.lineage.sourceId === worksheet.sourceId &&
            metric.lineage.tabId === worksheet.tabId &&
            metric.state === "validated",
        ),
    })),
    metrics: results,
  };
}

// Read currency evidence from the original cells before normalization loses symbols.
// Evidence is refreshed with each successful import, independently of confirmation.
export function currencyEvidence(values, headerRow, semantic, headers, table) {
  const fields = Object.entries(semantic.fields).filter(([f]) =>
    ["revenue", "expense", "amount", "outstanding_amount"].includes(f),
  );
  const indices = fields
    .map(([, name]) => headers.indexOf(name))
    .filter((i) => i >= 0);
  const codeIndex = headers.findIndex((h) =>
    /^(currency|currency code)$/i.test(h.trim()),
  );
  const found = new Set();
  let conflict = false,
    identifierLoss = false;
  const idIndex = headers.indexOf(semantic.fields.entity_id);
  const numericIdentifier =
    table?.types[table.headers.indexOf(semantic.fields.entity_id)] === "number";
  for (const row of values.slice(headerRow + 1)) {
    if (!row.some((v) => String(v ?? "").trim())) continue;
    if (
      numericIdentifier &&
      idIndex >= 0 &&
      typeof row[idIndex] === "string" &&
      /^0\d+$/.test(row[idIndex].trim())
    )
      identifierLoss = true;
    if (codeIndex >= 0) {
      const code = String(row[codeIndex] ?? "")
        .trim()
        .toUpperCase();
      if (!currencies.has(code)) conflict = true;
      else found.add(code);
    }
    for (const index of indices) {
      const raw = String(row[index] ?? "").trim();
      const code =
        raw.match(/^([A-Z]{3})\s*[-+(\d]/i)?.[1]?.toUpperCase() ||
        raw.match(/[\d)]\s*([A-Z]{3})$/i)?.[1]?.toUpperCase();
      if (code) {
        if (currencies.has(code)) found.add(code);
        else conflict = true;
      }
      for (const [symbol, unit] of [
        ["€", "EUR"],
        ["£", "GBP"],
        ["₹", "INR"],
      ])
        if (raw.includes(symbol)) found.add(unit);
      if (
        raw.includes("$") &&
        semantic.currency &&
        !new Intl.NumberFormat("en", {
          style: "currency",
          currency: semantic.currency,
        })
          .formatToParts(1)
          .some((p) => p.type === "currency" && p.value.includes("$"))
      )
        conflict = true;
    }
  }
  return { currencies: [...found].sort(), conflict, identifierLoss };
}
