import { columns } from "./sheets-validation.mjs";
import { z } from "zod";
import { digest } from "./intelligence-policy.mjs";
import { schemaOf } from "./semantic-intelligence.mjs";
import { dateInTimezone } from "../shared/sync-time.mjs";
const endpoint = z
  .object({
    scope: z.string().min(1).max(160),
    entity: z.enum([
      "client",
      "project",
      "employee",
      "resource",
      "invoice",
      "deal",
    ]),
    idColumn: z.string().min(1).max(200),
    labelColumn: z.string().max(200).default(""),
    namespace: z.string().min(1).max(80),
    schema: z.string().min(1).max(20000),
  })
  .strict();
export const relationshipContractsSchema = z
  .array(
    z
      .object({
        id: z.string().uuid(),
        label: z.string().trim().min(1).max(100),
        from: endpoint,
        to: endpoint,
        foreignKey: z.string().min(1).max(200),
        confirmed: z.literal(true),
      })
      .strict(),
  )
  .max(30)
  .refine(
    (v) => new Set(v.map((c) => c.id)).size === v.length,
    "Relationship IDs must be unique.",
  );
const keyOf = (v) =>
  typeof v === "string" && v.trim()
    ? JSON.stringify(["text", v])
    : typeof v === "number" && Number.isSafeInteger(v)
      ? JSON.stringify(["number", v])
      : null;
function unsafeNumericIdentifier(entry, column) {
  const t = entry.tab.table,
    index = t?.headers.indexOf(column);
  if (index < 0 || t?.types[index] !== "number") return false;
  const values = entry.source.workbook?.find(
    (w) => w.tabId === entry.tab.tabId,
  )?.values;
  if (!values) return true;
  const header = entry.tab.config?.headerRow || 0,
    rawIndex = columns(values.slice(header)).indexOf(column);
  return (
    rawIndex < 0 ||
    values.slice(header + 1).some((row) => {
      const v = row[rawIndex];
      if (v === null || v === undefined || v === "") return false;
      return typeof v === "number"
        ? !Number.isSafeInteger(v)
        : typeof v !== "string" || !/^-?(0|[1-9]\d*)$/.test(v);
    })
  );
}
function rowsFor(entry, mapping, now, timezone, freshness) {
  const t = entry.tab.table,
    s = entry.tab.semantic;
  if (
    !t ||
    !s?.enabled ||
    entry.tab.skipped ||
    entry.tab.error ||
    s.identityMode === "reporting_date" ||
    s.schema !== schemaOf(t) ||
    mapping.schema !== schemaOf(t) ||
    s.entityNamespace !== mapping.namespace ||
    s.fields.entity_id !== mapping.idColumn
  )
    return {
      error:
        "Confirm the worksheet identity and current column mappings in Data connections.",
    };
  const expected =
    { client: "other", employee: "resource" }[mapping.entity] || mapping.entity;
  if (s.entity !== expected)
    return {
      error:
        "The confirmed worksheet entity does not match this relationship mapping.",
    };
  if (
    !entry.tab.lastSuccess ||
    now - entry.tab.lastSuccess > freshness * 3600000
  )
    return { error: "Refresh the source before using its relationships." };
  if (!s.fields.date && s.confirmedDataVersion !== digest(t.rows))
    return {
      error:
        "Records changed; reconfirm the worksheet reporting period in Data connections.",
    };
  if (
    s.period.kind === "snapshot" &&
    s.period.asOf !== dateInTimezone(timezone, now)
  )
    return {
      error:
        "The snapshot date needs confirmation for current relationship reporting.",
    };
  const idIndex = t.headers.indexOf(mapping.idColumn),
    labelIndex = t.headers.indexOf(mapping.labelColumn);
  if (
    idIndex < 0 ||
    !["text", "number"].includes(t.types[idIndex]) ||
    (mapping.labelColumn && (labelIndex < 0 || t.types[labelIndex] !== "text"))
  )
    return {
      error: "Relationship fields need validated identifier and text columns.",
    };
  if (
    s.observation?.identifierLoss ||
    unsafeNumericIdentifier(entry, mapping.idColumn)
  )
    return {
      error:
        "Identifier formatting may have been lost. Remap IDs as text before joining.",
    };
  const dateIndex = t.headers.indexOf(s.fields.date);
  const rows = t.rows
    .map((values, index) => ({ values, index }))
    .filter(({ values }) => {
      if (s.period.kind !== "interval" || dateIndex < 0) return true;
      const d = values[dateIndex];
      return (
        typeof d === "string" &&
        d >= s.period.start &&
        d < s.period.endExclusive
      );
    });
  // Reject incomplete period selection rather than silently ignoring malformed dates.
  if (
    dateIndex >= 0 &&
    t.rows.some(
      (r) =>
        typeof r[dateIndex] !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(r[dateIndex]),
    )
  )
    return {
      error:
        "Reporting dates need validation before relationship investigation.",
    };
  const index = new Map();
  let missing = 0;
  for (const row of rows) {
    const key = keyOf(row.values[idIndex]);
    if (!key) {
      missing++;
      continue;
    }
    const found = index.get(key) || [];
    found.push(row);
    index.set(key, found);
  }
  const duplicate = [...index.values()]
    .filter((a) => a.length > 1)
    .reduce((n, a) => n + a.length, 0);
  return {
    rows,
    index,
    missing,
    duplicate,
    idIndex,
    labelIndex,
    period: s.period,
  };
}
export function buildRelationships({ state, policy, context, revision, now }) {
  const parsed = relationshipContractsSchema.safeParse(
    state.company.data.relationshipContracts || [],
  );
  const contracts = parsed.success ? parsed.data : [],
    relationships = [],
    diagnostics = [],
    groups = new Map(),
    scopeMap = new Map();
  const timezone = state.company.profile?.timezone || "UTC",
    freshness = state.catalog.semanticSettings?.freshnessHours || 48;
  const options = policy.admin
    ? [...policy.scopes]
        .filter(([, e]) => e.tab.semantic?.enabled && e.tab.table)
        .map(([scope, e]) => ({
          scope,
          title: `${e.source.title} / ${e.tab.title}`,
          department: e.department,
          entity: e.tab.semantic.entity,
          idColumn: e.tab.semantic.fields.entity_id || "",
          namespace: e.tab.semantic.entityNamespace,
          schema: schemaOf(e.tab.table),
          columns: e.tab.table.headers.map((name, i) => ({
            name,
            type: e.tab.table.types[i],
          })),
        }))
    : undefined;
  const targetsByReference = new Map();
  for (const c of contracts) {
    const ref = digest([
      c.from.scope,
      c.from.namespace,
      c.from.idColumn,
      c.foreignKey,
    ]);
    const targets = targetsByReference.get(ref) || new Set();
    targets.add(
      digest([c.to.scope, c.to.namespace, c.to.entity, c.to.idColumn]),
    );
    targetsByReference.set(ref, targets);
  }
  for (const c of contracts) {
    const a = policy.scopes.get(c.from.scope),
      b = policy.scopes.get(c.to.scope);
    // Hide the entire contract, including its label and diagnostics, unless both endpoints and join fields are authorized.
    if (
      !a ||
      !b ||
      (!policy.admin &&
        (![c.from.idColumn, c.foreignKey].every((h) => a.columns.includes(h)) ||
          !b.columns.includes(c.to.idColumn)))
    )
      continue;
    if (
      !context.department ||
      [a.department, b.department].includes(context.department)
    ) {
      for (const [mapping, entry] of [
        [c.from, a],
        [c.to, b],
      ])
        scopeMap.set(mapping.scope, {
          id: mapping.scope,
          label: `${entry.source.title} / ${entry.tab.title}`,
          currency: null,
        });
    }
    if (context.scope && ![c.from.scope, c.to.scope].includes(context.scope))
      continue;
    if (
      context.department &&
      ![a.department, b.department].includes(context.department)
    )
      continue;
    const diagnostic = {
      id: c.id,
      label: c.label,
      scope: c.from.scope,
      state: "validated",
      missingIdentifiers: 0,
      duplicateIdentifiers: 0,
      missingReferences: 0,
      unresolvedReferences: 0,
      reason: "",
    };
    if (
      targetsByReference.get(
        digest([c.from.scope, c.from.namespace, c.from.idColumn, c.foreignKey]),
      ).size > 1
    ) {
      diagnostics.push({
        ...diagnostic,
        state: "needs_review",
        reason: policy.admin
          ? "This reference column has conflicting target identity mappings. Confirm one target definition before joining."
          : "This relationship mapping requires administrator review.",
      });
      continue;
    }
    const left = rowsFor(a, c.from, now, timezone, freshness),
      right = rowsFor(b, c.to, now, timezone, freshness);
    const fk = a.tab.table?.headers.indexOf(c.foreignKey) ?? -1;
    if (
      unsafeNumericIdentifier(a, c.foreignKey) ||
      left.error ||
      right.error ||
      fk < 0 ||
      !["text", "number"].includes(a.tab.table.types[fk])
    ) {
      diagnostics.push({
        ...diagnostic,
        state: "needs_review",
        reason:
          left.error ||
          right.error ||
          (unsafeNumericIdentifier(a, c.foreignKey)
            ? "Reference IDs may have lost formatting. Remap the reference column as text."
            : "Choose a validated reference ID column."),
      });
      continue;
    }
    if (
      JSON.stringify([
        left.period.kind,
        left.period.asOf,
        left.period.start,
        left.period.endExclusive,
      ]) !==
      JSON.stringify([
        right.period.kind,
        right.period.asOf,
        right.period.start,
        right.period.endExclusive,
      ])
    ) {
      diagnostics.push({
        ...diagnostic,
        state: "needs_review",
        reason:
          "Relationship endpoints have incompatible confirmed reporting periods. No join was calculated.",
      });
      continue;
    }
    diagnostic.missingIdentifiers = left.missing + right.missing;
    diagnostic.duplicateIdentifiers = left.duplicate + right.duplicate;
    const entity = (e, m, r, data) => {
      const allowedLabel = policy.admin || e.columns.includes(m.labelColumn);
      return {
        id: digest([m.scope, m.entity, m.idColumn, r.values[data.idIndex]]),
        type: m.entity,
        identifier: r.values[data.idIndex],
        label:
          allowedLabel && m.labelColumn
            ? r.values[data.labelIndex] || null
            : null,
        department: e.department,
        scope: m.scope,
      };
    };
    for (const [identity, sourceRows] of left.index) {
      if (sourceRows.length !== 1) continue;
      const row = sourceRows[0],
        ref = keyOf(row.values[fk]);
      if (!ref) {
        diagnostic.missingReferences++;
        continue;
      }
      const target = right.index.get(ref);
      if (!target) {
        diagnostic.unresolvedReferences++;
        continue;
      }
      if (target.length !== 1) continue;
      const from = entity(a, c.from, row, left),
        to = entity(b, c.to, target[0], right);
      const id = digest([c.id, from.id, to.id]);
      const relation = {
        id,
        contractId: c.id,
        label: c.label,
        from,
        to,
        period: left.period,
        state: "validated",
        definition: `Exact, type-preserving match: ${c.foreignKey} → ${c.to.idColumn}. Both entity identifiers are unique in their confirmed reporting scopes.`,
        evidence: [
          {
            scope: c.from.scope,
            row: row.index,
            columns: [
              ...new Set([
                c.from.idColumn,
                c.foreignKey,
                ...((policy.admin || a.columns.includes(c.from.labelColumn)) &&
                c.from.labelColumn
                  ? [c.from.labelColumn]
                  : []),
              ]),
            ],
          },
          {
            scope: c.to.scope,
            row: target[0].index,
            columns: [
              ...new Set([
                c.to.idColumn,
                ...((policy.admin || b.columns.includes(c.to.labelColumn)) &&
                c.to.labelColumn
                  ? [c.to.labelColumn]
                  : []),
              ]),
            ],
          },
        ],
      };
      relationships.push(relation);
      if (
        from.type === "project" &&
        ["resource", "employee"].includes(to.type)
      ) {
        const key = digest([to.id, left.period]);
        const g = groups.get(key) || {
          id: key,
          entity: to,
          period: left.period,
          projects: new Map(),
          relationshipIds: [],
        };
        g.projects.set(from.id, from);
        g.relationshipIds.push(id);
        groups.set(key, g);
      }
    }
    if (
      diagnostic.missingIdentifiers ||
      diagnostic.duplicateIdentifiers ||
      diagnostic.missingReferences ||
      diagnostic.unresolvedReferences
    ) {
      diagnostic.state = "partial";
      diagnostic.reason =
        "Only exact references between unique identifiers are confirmed; incomplete or ambiguous rows were excluded.";
    }
    diagnostics.push(diagnostic);
  }
  return {
    scopes: [...scopeMap.values()],
    relationships,
    diagnostics,
    concerns: [...groups.values()]
      .filter((g) => g.projects.size > 1)
      .map((g) => ({
        id: g.id,
        title: "Shared resource dependency",
        entity: g.entity,
        period: g.period,
        projectCount: g.projects.size,
        relationshipIds: g.relationshipIds,
        explanation: `${g.projects.size} distinct confirmed projects reference this resource in the same reporting period. Review commitments; this does not establish overlapping work, insufficient capacity or a predicted delay.`,
      })),
    ...(policy.admin
      ? { configuration: { contracts, worksheets: options } }
      : {}),
    state: diagnostics.length
      ? relationships.length
        ? diagnostics.some((d) => d.state !== "validated")
          ? "partial"
          : "validated"
        : "needs_review"
      : "not_configured",
  };
}
