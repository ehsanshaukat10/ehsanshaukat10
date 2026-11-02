import { z } from "zod";
import { randomUUID } from "node:crypto";
import { digest } from "./intelligence-policy.mjs";
import { fail } from "./database.mjs";
const texts = {
  "finance.overdue_receivables": {
    why: "Recorded outstanding balances are past their confirmed due dates. This does not establish when payment will arrive.",
    next: "Review the contributing invoices and confirm the responsible owner and next follow-up.",
  },
  "delivery.overdue_projects": {
    why: "Recorded active commitments are past their mapped due dates. Their current delivery status needs review.",
    next: "Review the overdue project records and confirm the current blocker, owner and next step.",
  },
  "resources.utilization": {
    why: "Assigned hours exceed available capacity for this confirmed period. This is planned demand, not measured actual utilization.",
    next: "Review assigned and available hours before agreeing changes to workload or commitments.",
  },
  "finance.profit": {
    why: "Validated operating expenses exceed recognized revenue for this scope and period. The records alone do not establish the cause.",
    next: "Review the contributing revenue and expense records before deciding on a response.",
  },
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const status = z.enum([
  "Recommended",
  "Accepted",
  "In Progress",
  "Completed",
  "Dismissed",
]);
const taskSchema = z
  .object({
    title: z.string().trim().min(1).max(150),
    note: z.string().max(2000).default(""),
    scope: z.string().max(160).default(""),
    department: z.string().max(80).default(""),
    status: z
      .enum(["Accepted", "In Progress", "Completed", "Dismissed"])
      .default("Accepted"),
    version: z.number().int().min(0).default(0),
    id: z.string().uuid().optional(),
  })
  .strict();
const decisionSchema = z
  .object({
    version: z.number().int().min(0),
    evidenceRevision: z.string().length(64),
    status,
    note: z.string().max(2000).default(""),
    reason: z.string().max(1000).default(""),
  })
  .strict();
const parse = (schema, body) => {
  const r = schema.safeParse(body);
  if (!r.success) fail(400, "Review the action fields.");
  return r.data;
};
function amount(m) {
  return m.unit === "currency"
    ? new Intl.NumberFormat("en", {
        style: "currency",
        currency: m.currency,
      }).format(m.value)
    : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(
        m.value,
      ) + (m.unit === "percent" ? "%" : "");
}
export function recommendations(report) {
  return report.executive.issues
    .filter((i) => i.metric.state === "validated" && texts[i.metric.metricId])
    .map((issue) => {
      const m = issue.metric,
        rule = texts[m.metricId],
        id =
          "recommendation-" +
          digest([
            m.companyId,
            m.scope,
            m.metricId,
            m.period,
            m.currency,
            m.entityNamespace,
          ]).slice(0, 40);
      return {
        id,
        concernId: issue.id,
        origin: "system",
        title: issue.title,
        department: m.department || "",
        scope: m.scope,
        status: "Recommended",
        version: 0,
        current: true,
        support: "current",
        what: `${m.name}: ${amount(m)}.`,
        why: rule.why,
        next: rule.next,
        evidenceHref: issue.href,
        evidenceRevision: report.datasetRevision,
        fact: {
          metricId: m.metricId,
          name: m.name,
          value: m.value,
          unit: m.unit,
          currency: m.currency,
          period: m.period,
          definition: m.definition,
          scope: m.scope,
          sourceId: m.lineage.sourceId,
          tabId: m.lineage.tabId,
          datasetRevision: report.datasetRevision,
        },
        fingerprint: digest([
          m.metricId,
          m.value,
          m.period,
          m.currency,
          m.lineage.contributingRows,
        ]),
      };
    });
}
export function projectActions({ report, policy, records }) {
  const current = recommendations(report),
    map = new Map(current.map((x) => [x.id, x]));
  for (const record of records) {
    const d = record.data;
    if (!policy.canReadAction(d.protection)) continue;
    if (report.context.department && d.department !== report.context.department)
      continue;
    if (report.context.scope && d.scope !== report.context.scope) continue;
    if (record.kind === "task")
      map.set(record.id, {
        id: record.id,
        origin: "user",
        title: d.title,
        note: d.note,
        department: d.department,
        scope: d.scope,
        status: d.status,
        version: record.version,
        current: true,
        support: "manual",
        updatedAt: record.updated,
      });
    else {
      const active = map.get(record.id);
      if (active)
        map.set(record.id, {
          ...active,
          status: d.status,
          note: d.note,
          reason: d.reason,
          version: record.version,
          evidenceChanged: active.fingerprint !== d.fingerprint,
          updatedAt: record.updated,
        });
      else
        map.set(record.id, {
          ...d.snapshot,
          id: record.id,
          status: d.status,
          note: d.note,
          reason: d.reason,
          version: record.version,
          current: false,
          support: "historical",
          evidenceHref: null,
          evidenceRevision: null,
          updatedAt: record.updated,
        });
    }
  }
  const rows = [...map.values()].filter(
    (x) =>
      (!report.context.scope || x.scope === report.context.scope) &&
      (!report.context.department ||
        x.department === report.context.department),
  );
  return {
    version: 1,
    companyId: report.companyId,
    datasetRevision: report.datasetRevision,
    authorization: report.authorization,
    context: report.context,
    items: rows,
  };
}
export function createActionService({ intelligence, db }) {
  return {
    async list(company, actor, context) {
      return intelligence.withAuthorizedState(
        company,
        actor,
        context,
        projectActions,
      );
    },
    async task(company, actor, body) {
      const input = parse(taskSchema, body);
      return intelligence.withAuthorizedState(
        company,
        actor,
        {},
        async (state) => {
          const { policy, report, fence } = state;
          if (!policy.admin)
            fail(403, "An Owner or Admin records tasks and decisions.");
          const existing = input.id
            ? state.records.find((r) => r.id === input.id && r.kind === "task")
            : null;
          if (input.id && !existing && input.version !== 0)
            fail(404, "Task unavailable.");
          const entry = input.scope ? policy.require(input.scope) : null;
          const department = entry?.department || input.department;
          if (department && !report.departments.includes(department))
            fail(400, "Choose a configured department.");
          if (
            entry &&
            input.department &&
            input.department !== entry.department
          )
            fail(400, "Task scope and department do not match.");
          const id = input.id || randomUUID();
          const data = {
            title: input.title,
            note: input.note,
            status: input.status,
            scope: input.scope,
            department,
            protection: entry?.protection || {
              scope: "",
              department,
              category: "other",
              sensitivities: ["confidential"],
            },
          };
          if (
            existing &&
            input.version === 0 &&
            digest(canonical(existing.data)) === digest(canonical(data))
          )
            return { id: existing.id, version: existing.version };
          const saved = await db.rpc("action_write", {
            p_actor: actor,
            p_company: company,
            p_id: id,
            p_kind: "task",
            p_data: data,
            p_version: input.version,
            p_fence: fence,
          });
          return { id: saved.id, version: saved.version };
        },
      );
    },
    async decision(company, actor, id, body) {
      const input = parse(decisionSchema, body);
      return intelligence.withAuthorizedState(
        company,
        actor,
        {},
        async (state) => {
          const { policy, report, fence } = state;
          if (!policy.admin)
            fail(403, "An Owner or Admin records tasks and decisions.");
          const recommendation = recommendations(report).find(
            (r) => r.id === id,
          );
          if (
            !recommendation ||
            input.evidenceRevision !== report.datasetRevision
          )
            fail(
              409,
              "Recommendation evidence changed or is unavailable. Refresh before recording a decision.",
            );
          const data = {
            status: input.status,
            note: input.note,
            reason: input.reason,
            scope: recommendation.scope,
            department: recommendation.department,
            fingerprint: recommendation.fingerprint,
            protection: policy.require(recommendation.scope).protection,
            snapshot: recommendation,
          };
          const saved = await db.rpc("action_write", {
            p_actor: actor,
            p_company: company,
            p_id: id,
            p_kind: "decision",
            p_data: data,
            p_version: input.version,
            p_fence: fence,
          });
          return { id: saved.id, version: saved.version };
        },
      );
    },
  };
}
