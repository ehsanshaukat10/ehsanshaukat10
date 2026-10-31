// Explicit lexicographic selection, not an AI-generated score. Never aggregate scopes.
const purposeLabels = {
  finance: "Financial performance",
  sales: "Sales performance",
  delivery: "Project delivery",
  resources: "Resource capacity",
};
const priorityPurpose = (text) =>
  /cash|profit|margin|financial|expense|revenue/i.test(text)
    ? "finance"
    : /sales|growth|pipeline|customer acquisition/i.test(text)
      ? "sales"
      : /delivery|project|deadline|quality/i.test(text)
        ? "delivery"
        : /resource|capacity|people|utilization|team/i.test(text)
          ? "resources"
          : null;
const labels = {
  "finance.revenue": "Revenue",
  "finance.expenses": "Operating expenses",
  "finance.profit": "Operating profit",
  "finance.margin": "Operating margin",
  "finance.overdue_receivables": "Overdue receivables",
  "sales.won_value": "Won deal value",
  "sales.won_deals": "Won deals",
  "delivery.active_projects": "Active projects",
  "delivery.overdue_projects": "Overdue projects",
  "resources.utilization": "Planned utilization",
};
export function buildExecutiveReport(view, company, catalog, requestedScope) {
  const valid = view.metrics.filter(
    (m) =>
      m.state === "validated" &&
      typeof m.value === "number" &&
      Number.isFinite(m.value),
  );
  const priorities = (company.data?.priorities || [])
    .map(priorityPurpose)
    .filter(Boolean);
  const configured = (company.data?.kpis || [])
    .filter((k) => k.enabled)
    .map((k) => String(k.name).toLowerCase());
  const model =
    String(company.business_model || company.businessModel || "") +
    " " +
    String(company.industry || "");
  const modelPurpose = /service|consult|agency|project/i.test(model)
    ? "delivery"
    : /saas|subscription|retail|commerce/i.test(model)
      ? "sales"
      : null;
  const rank = (scope) => [
    scope.metrics.some(
      (m) =>
        configured.includes(m.metricId) ||
        configured.includes(m.name.toLowerCase()) ||
        configured.includes((labels[m.metricId] || "").toLowerCase()),
    )
      ? 0
      : 1,
    priorities.includes(scope.purpose)
      ? priorities.indexOf(scope.purpose)
      : priorities.length,
    scope.purpose === modelPurpose ? 0 : 1,
  ];
  const scopes = view.worksheets
    .filter((w) => w.executiveEligible)
    .map((w) => {
      const metrics = valid.filter(
        (m) => m.lineage.sourceId === w.sourceId && m.lineage.tabId === w.tabId,
      );
      const s = w.confirmation;
      return {
        id: `${w.sourceId}:${w.tabId}`,
        sourceId: w.sourceId,
        tabId: w.tabId,
        label: s.label || purposeLabels[s.purpose] || "Business reporting",
        department: metrics[0]?.department,
        period: s.period,
        currency: s.currency,
        purpose: s.purpose,
        metrics,
      };
    })
    .filter((s) => s.metrics.length)
    .sort((a, b) => {
      const x = rank(a),
        y = rank(b);
      return (
        x[0] - y[0] ||
        x[1] - y[1] ||
        x[2] - y[2] ||
        a.label.localeCompare(b.label) ||
        a.id.localeCompare(b.id)
      );
    });
  const selected =
    scopes.find((s) => s.id === requestedScope) || scopes[0] || null;
  const selectedMetrics = selected?.metrics || [];
  const find = (id) => selectedMetrics.find((m) => m.metricId === id);
  const primaryIds =
    selected?.purpose === "finance"
      ? ["finance.revenue", "finance.profit", "finance.overdue_receivables"]
      : selected?.purpose === "sales"
        ? ["sales.won_value", "sales.won_deals"]
        : selected?.purpose === "delivery"
          ? ["delivery.active_projects", "delivery.overdue_projects"]
          : ["resources.utilization"];
  const primary = primaryIds
    .map(find)
    .filter(Boolean)
    .map((m) => ({ ...m, label: labels[m.metricId] }))
    .slice(0, 4);
  if (!primary.length && find("finance.expenses"))
    primary.push({ ...find("finance.expenses"), label: "Operating expenses" });
  const base = `/companies/${company.id}`;
  const evidenceLink = (m) =>
    `${base}/overview?scope=${encodeURIComponent(m.scope)}&evidence=${encodeURIComponent(m.metricId)}&source=${encodeURIComponent(m.lineage.sourceId)}&tab=${m.lineage.tabId}`;
  const issues = [];
  for (const scope of scopes)
    for (const m of scope.metrics) {
      const problem =
        m.metricId === "finance.overdue_receivables" && m.value > 0
          ? "Review overdue balances"
          : m.metricId === "delivery.overdue_projects" && m.value > 0
            ? "Review overdue projects"
            : m.metricId === "resources.utilization" && m.value > 100
              ? "Review planned capacity"
              : m.metricId === "finance.profit" && m.value < 0
                ? "Review operating loss"
                : null;
      if (problem)
        issues.push({
          id: `${m.scope}:${m.metricId}`,
          title: problem,
          metric: { ...m, label: labels[m.metricId] },
          scopeLabel: scope.label,
          department: scope.department,
          href: evidenceLink(m),
        });
    }
  // Use configured priorities, then selected scope, then stable identifiers. No comparison of unlike monetary impacts.
  issues.sort(
    (a, b) =>
      scopes.findIndex((s) => s.id === a.metric.scope) -
        scopes.findIndex((s) => s.id === b.metric.scope) ||
      Number(b.metric.scope === selected?.id) -
        Number(a.metric.scope === selected?.id) ||
      a.id.localeCompare(b.id),
  );
  let performance = null;
  if (
    selected?.purpose === "finance" &&
    (find("finance.revenue") || find("finance.expenses"))
  ) {
    const metrics = [
      "finance.revenue",
      "finance.expenses",
      "finance.profit",
      "finance.margin",
    ]
      .map(find)
      .filter(Boolean)
      .map((m) => ({ ...m, label: labels[m.metricId] }));
    const revenue = find("finance.revenue"),
      costs = find("finance.expenses");
    let series = [];
    if (revenue && costs) {
      const source = catalog.sources.find((s) => s.id === selected.sourceId),
        table = source?.tabs.find((t) => t.tabId === selected.tabId)?.table,
        fields = revenue.lineage.fields;
      if (table) {
        const days = new Map(),
          scale =
            10 **
            new Intl.NumberFormat("en", {
              style: "currency",
              currency: revenue.currency,
            }).resolvedOptions().maximumFractionDigits;
        for (const index of revenue.lineage.contributingRows) {
          const row = table.rows[index],
            date = row[table.headers.indexOf(fields.date)];
          const item = days.get(date) || { date, revenue: 0, costs: 0 };
          item.revenue += Math.round(
            row[table.headers.indexOf(fields.revenue)] * scale,
          );
          item.costs += Math.round(
            row[table.headers.indexOf(fields.expense)] * scale,
          );
          days.set(date, item);
        }
        series = [...days.values()]
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((p) => ({
            ...p,
            revenue: p.revenue / scale,
            costs: p.costs / scale,
          }));
      }
    }
    performance = { kind: "finance", metrics, series };
  } else if (
    selected?.purpose === "delivery" &&
    find("delivery.active_projects") &&
    find("delivery.overdue_projects")
  )
    performance = {
      kind: "delivery",
      metrics: ["delivery.active_projects", "delivery.overdue_projects"]
        .map(find)
        .map((m) => ({ ...m, label: labels[m.metricId] })),
      series: [],
    };
  else if (selected?.purpose === "resources" && find("resources.utilization"))
    performance = {
      kind: "resources",
      metrics: [
        { ...find("resources.utilization"), label: "Planned utilization" },
      ],
      series: [],
    };
  const unresolved = view.worksheets.filter(
    (w) =>
      w.confirmation?.enabled !== false &&
      !["reference", "other"].includes(w.confirmation?.purpose) &&
      !w.executiveEligible,
  );
  const blocked = view.metrics.filter(
    (m) => m.state !== "validated" && m.state !== "unavailable",
  );
  const state = valid.length
    ? "ready"
    : view.worksheets.length
      ? "review"
      : "empty";
  const dataStatus = blocked.some((m) => m.state === "stale")
    ? "Data needs refresh"
    : unresolved.length
      ? "Review business meanings"
      : null;
  return {
    version: 1,
    state,
    selectedScope: selected?.id || null,
    scopes: scopes.map(({ metrics, ...s }) => s),
    primary,
    performance,
    issues,
    additional: scopes
      .filter((s) => s.id !== selected?.id)
      .map((s) => ({
        ...s,
        metrics: s.metrics
          .filter((m) => !m.metricId.endsWith(".margin"))
          .slice(0, 2)
          .map((m) => ({ ...m, label: labels[m.metricId] })),
      })),
    dataStatus,
    reviewHref:
      base +
      "/connections?business=1" +
      (unresolved[0]
        ? `&source=${encodeURIComponent(unresolved[0].sourceId)}&tab=${unresolved[0].tabId}`
        : ""),
    summary: issues.length
      ? `${issues.length} supported ${issues.length === 1 ? "issue needs" : "issues need"} attention across confirmed reporting scopes.`
      : selected
        ? `Confirmed ${purposeLabels[selected.purpose]?.toLowerCase() || "business reporting"} for ${selected.label}.`
        : null,
  };
}
