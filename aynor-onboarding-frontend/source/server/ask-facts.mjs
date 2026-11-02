import { projectGoals } from "./goal-service.mjs";
import { projectActions } from "./action-service.mjs";
import { digest } from "./intelligence-policy.mjs";
import { periodKey } from "./goal-definition.mjs";
import { dateInTimezone } from "../shared/sync-time.mjs";
export function buildAskFacts(state, now = () => Date.now()) {
  const { report, policy } = state,
    facts = [],
    aliases = [];
  let entityNumber = 0;
  const externalScopes = (scopes) =>
    scopes.every((s) => {
      const p = policy.scopes.get(s)?.protection;
      return p && !p.sensitivities.includes("payroll");
    });
  const add = (key, fact) => {
    facts.push({
      id: digest(key).slice(0, 32),
      ...fact,
      externalEligible: externalScopes(fact.scopes),
    });
  };
  const metricLink = (m) =>
    `/companies/${report.companyId}/overview?scope=${encodeURIComponent(m.scope)}&evidence=${m.metricId}&source=${m.lineage.sourceId}&tab=${m.lineage.tabId}&revision=${report.datasetRevision}`;
  for (const m of report.metrics.filter(
    (m) => !report.context.scope || m.scope === report.context.scope,
  )) {
    const category = policy.scopes.get(m.scope)?.protection.category;
    if (!category) continue;
    add(["metric", m.scope, m.metricId], {
      kind: "metric",
      label: m.name,
      department: m.department || "",
      scopes: [m.scope],
      categories: [category],
      period: m.period,
      unit: m.unit,
      currency: m.currency,
      value: m.state === "validated" ? m.value : null,
      state: m.state,
      metricId: m.metricId,
      definition: m.definition,
      reason:
        m.state === "validated"
          ? null
          : m.reasons[0] || "Needs source confirmation",
      href:
        m.state === "validated"
          ? metricLink(m)
          : `/companies/${report.companyId}/connections?map=1`,
      next:
        m.state === "validated"
          ? "Investigate the contributing records."
          : "Review source meanings, period and freshness.",
    });
  }
  const goalView = projectGoals(state, now);
  for (const g of goalView.items) {
    const entry = policy.scopes.get(g.scope);
    if (!entry) continue;
    add(["goal", g.id], {
      kind: "goal",
      originId: g.id,
      metricId: g.metricId,
      label: g.title,
      department: g.department || entry.department,
      scopes: [g.scope],
      categories: [entry.protection.category],
      period: g.period,
      unit: g.unit,
      currency: g.currency,
      state: g.available ? "validated" : "unassessed",
      value: g.actual,
      target: g.target,
      baseline: g.baseline,
      progress: g.progress,
      assessment: g.assessment,
      lifecycle: g.lifecycle,
      deadline: g.deadline,
      deadlinePassed: g.deadlinePassed,
      ownerLabel: g.owner,
      direction: g.direction,
      definition: g.progressExplanation,
      reason: g.reason || null,
      href: `/companies/${report.companyId}/goals/${g.id}`,
      evidenceHref: g.evidenceHref,
      next:
        g.concern?.next ||
        g.next ||
        "Review the goal definition and its supporting measure.",
    });
  }
  const actionView = projectActions(state);
  for (const a of actionView.items.filter(
    (a) => a.origin === "system" && a.current && a.fact,
  )) {
    const entry = policy.scopes.get(a.scope);
    if (!entry) continue;
    add(["recommendation", a.id], {
      kind: "recommendation",
      originId: a.id,
      label: a.title,
      department: a.department,
      scopes: [a.scope],
      categories: [entry.protection.category],
      period: a.fact.period,
      unit: a.fact.unit,
      currency: a.fact.currency,
      value: a.fact.value,
      state: "validated",
      metricId: a.fact.metricId,
      definition: a.why,
      next: a.next,
      href: `/companies/${report.companyId}/actions/${a.id}`,
      evidenceHref: a.evidenceHref,
      status: a.status,
    });
  }
  const relationships = state.relationships();
  for (const r of relationships.relationships) {
    const categories = [
      ...new Set(
        [r.from.scope, r.to.scope].map(
          (s) => policy.scopes.get(s).protection.category,
        ),
      ),
    ];
    for (const e of [r.from, r.to])
      if (!aliases.some((a) => a.id === e.id)) {
        const alias = `${e.type} E${++entityNumber}`;
        aliases.push({
          id: e.id,
          alias,
          terms: [e.label, String(e.identifier)].filter(Boolean),
        });
      }
    const entity = (e) => aliases.find((a) => a.id === e.id).alias;
    add(["relationship", r.id], {
      kind: "relationship",
      originId: r.id,
      label: `${r.from.label || r.from.identifier} → ${r.to.label || r.to.identifier}`,
      department: r.from.department,
      scopes: [r.from.scope, r.to.scope],
      categories,
      period: r.period,
      state: "validated",
      from: entity(r.from),
      to: entity(r.to),
      definition: r.definition,
      href: `/companies/${report.companyId}/dependencies/${r.id}/evidence`,
      next: "Investigate the confirmed reference and both source rows.",
    });
  }
  for (const c of relationships.concerns) {
    const links = c.relationshipIds.map((id) =>
      relationships.relationships.find((r) => r.id === id),
    );
    const scopes = [
      ...new Set(links.flatMap((r) => [r.from.scope, r.to.scope])),
    ];
    add(["dependencyConcern", c.id], {
      kind: "dependency",
      label: `Shared resource: ${c.entity.label || c.entity.identifier}`,
      department: c.entity.department,
      scopes,
      categories: [
        ...new Set(scopes.map((s) => policy.scopes.get(s).protection.category)),
      ],
      period: c.period,
      state: "validated",
      value: c.projectCount,
      unit: "count",
      currency: null,
      entity: aliases.find((a) => a.id === c.entity.id)?.alias,
      definition: c.explanation,
      href: `/companies/${report.companyId}/dependencies/${c.relationshipIds[0]}`,
      next: "Review the confirmed project references; these do not establish overlapping work or a capacity shortage.",
    });
  }
  const departments = [
    ...new Set(facts.map((f) => f.department).filter(Boolean)),
  ].map((name, i) => ({ name, alias: `Department D${i + 1}` }));
  const safeFacts = facts.map((f, i) => ({ ...f, ref: `F${i + 1}` }));
  const today = dateInTimezone(state.timezone, now());
  return {
    report,
    policy,
    facts: safeFacts,
    aliases,
    departments,
    membership: state.membership,
    actionVersions: state.records
      .map((r) => [r.id, r.version])
      .sort((a, b) => a[0].localeCompare(b[0])),
    companyData: state.companyData,
    companyVersion: state.companyVersion,
    fence: state.fence,
    today,
    proof: digest([
      report.datasetRevision,
      report.authorization.fingerprint,
      report.context.key,
      today,
      safeFacts,
    ]),
  };
}
export function compatibleComparison(facts) {
  return (
    facts.length >= 2 &&
    facts.every(
      (f) =>
        f.kind === "metric" &&
        f.state === "validated" &&
        f.value !== null &&
        f.metricId === facts[0].metricId &&
        f.unit === facts[0].unit &&
        f.currency === facts[0].currency &&
        periodKey(f.period) === periodKey(facts[0].period),
    )
  );
}
// External serialization is deliberately separate: no raw rows, names, column headers, URLs, owner/task notes or user-supplied goal titles.
export function externalFact(f, bundle) {
  return {
    id: f.ref,
    kind: f.kind,
    metricId: f.metricId,
    scopes: f.scopes.map(
      (scope) =>
        `Scope S${[...new Set(bundle.facts.flatMap((f) => f.scopes))].indexOf(scope) + 1}`,
    ),
    measure:
      f.kind === "metric"
        ? f.label
        : f.kind === "recommendation"
          ? f.metricId
          : f.kind === "goal"
            ? "Administrator-defined goal"
            : f.kind,
    department:
      bundle.departments.find((d) => d.name === f.department)?.alias ||
      "Company",
    period: f.period,
    state: f.state,
    unit: f.unit,
    currency: f.currency,
    value: f.value,
    target: f.target,
    baseline: f.baseline,
    progress: f.progress,
    assessment: f.assessment,
    lifecycle: f.lifecycle,
    deadline: f.deadline,
    deadlinePassed: f.deadlinePassed,
    hasOwnerLabel: !!f.ownerLabel,
    direction: f.direction,
    from: f.from,
    to: f.to,
    entity: f.entity,
  };
}
export function redactQuestion(text, bundle) {
  let out = text;
  const terms = [
    ...bundle.aliases.flatMap((a) =>
      a.terms.map((term) => ({ term, alias: a.alias })),
    ),
    ...bundle.departments.map((d) => ({ term: d.name, alias: d.alias })),
    ...bundle.facts
      .filter((f) => f.kind === "goal")
      .map((f) => ({ term: f.label, alias: `goal ${f.ref}` })),
  ].sort((a, b) => b.term.length - a.term.length);
  for (const { term, alias } of terms)
    if (term.length > 1)
      out = out.replace(
        new RegExp(
          "(?<![A-Za-z0-9_])" +
            term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
            "(?![A-Za-z0-9_])",
          "gi",
        ),
        alias,
      );
  return out
    .replace(
      /https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\bsk-[a-z0-9_-]{12,}|\beyJ[a-z0-9_.-]{20,}/gi,
      "[redacted]",
    )
    .replace(
      /\b(password|secret|api[ _-]?key|access[ _-]?token)\s*[:=]?\s*\S+/gi,
      "$1 [redacted]",
    );
}
