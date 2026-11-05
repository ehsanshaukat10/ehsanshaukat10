// Explicit lexicographic selection, not an AI-generated score. Company view
// presents separate validated measures; it never adds incompatible scopes.
const purposeLabels = {
  finance: "Financial performance",
  sales: "Sales performance",
  delivery: "Project delivery",
  resources: "Resource capacity",
  marketing: "Marketing performance",
  operations: "Inventory operations",
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
          : /marketing|campaign|leads?|acquisition/i.test(text)
            ? "marketing"
            : /operations|inventory|stock|logistics/i.test(text)
              ? "operations"
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
  "marketing.spend": "Campaign spend",
  "marketing.leads": "Generated leads",
  "marketing.qualified_leads": "Qualified leads",
  "operations.on_hand": "Units on hand",
  "operations.reorder_items": "Items below reorder level",
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
  const selected = requestedScope
    ? scopes.find((s) => s.id === requestedScope) || null
    : null;
  const selectedMetrics = selected?.metrics || [];
  const find = (id) => selectedMetrics.find((m) => m.metricId === id);
  const primaryIds =
    selected?.purpose === "finance"
      ? ["finance.revenue", "finance.profit", "finance.overdue_receivables"]
      : selected?.purpose === "sales"
        ? ["sales.won_value", "sales.won_deals"]
        : selected?.purpose === "delivery"
          ? ["delivery.active_projects", "delivery.overdue_projects"]
          : selected?.purpose === "marketing"
            ? [
                "marketing.spend",
                "marketing.leads",
                "marketing.qualified_leads",
              ]
            : selected?.purpose === "operations"
              ? ["operations.on_hand", "operations.reorder_items"]
              : ["resources.utilization"];
  const configuredIds = selectedMetrics
    .filter(
      (m) =>
        configured.includes(m.metricId) ||
        configured.includes(m.name.toLowerCase()) ||
        configured.includes((labels[m.metricId] || "").toLowerCase()),
    )
    .map((m) => m.metricId);
  let primary = [...new Set([...configuredIds, ...primaryIds])]
    .map(find)
    .filter(Boolean)
    .map((m) => ({ ...m, label: labels[m.metricId] }))
    .slice(0, selected?.purpose === "finance" ? 2 : 4);
  if (!primary.length && selectedMetrics.length) {
    const metric =
      find("finance.expenses") || find("finance.margin") || selectedMetrics[0];
    primary.push({ ...metric, label: labels[metric.metricId] });
  }
  if (!selected && scopes.length) {
    // Executive snapshot: a stable, intentionally small hierarchy. Values
    // remain attached to their confirmed scope and are never combined.
    const configuredExecutive = scopes
      .flatMap((scope) => scope.metrics)
      .filter(
        (metric) =>
          configured.includes(metric.metricId) ||
          configured.includes(metric.name.toLowerCase()) ||
          configured.includes((labels[metric.metricId] || "").toLowerCase()),
      )
      .map((metric) => metric.metricId);
    const executiveOrder = [
      ...new Set([
        ...configuredExecutive,
        "finance.revenue",
        "finance.profit",
        "sales.won_value",
        "resources.utilization",
        "marketing.qualified_leads",
        "marketing.leads",
        "delivery.overdue_projects",
        "operations.reorder_items",
        "operations.on_hand",
        "finance.expenses",
        "marketing.spend",
      ]),
    ];
    const candidates = scopes.flatMap((scope) =>
      scope.metrics.map((metric) => ({ metric, scope })),
    );
    primary = executiveOrder
      .map((metricId) =>
        candidates.find((item) => item.metric.metricId === metricId),
      )
      .filter(Boolean)
      .slice(0, 4)
      .map(({ metric, scope }) => ({
        ...metric,
        label: `${labels[metric.metricId] || metric.name} · ${scope.label}`,
      }));
  }
  const base = `/companies/${company.id}`;
  const evidenceLink = (m) =>
    `${base}/overview?scope=${encodeURIComponent(selected?.id || m.scope)}&evidence=${encodeURIComponent(m.metricId)}&source=${encodeURIComponent(m.lineage.sourceId)}&tab=${m.lineage.tabId}`;
  const issues = [];
  for (const scope of scopes)
    for (const m of scope.metrics) {
      const problem =
        m.metricId === "finance.overdue_receivables" && m.value > 0
          ? "Review overdue balances"
          : m.metricId === "delivery.overdue_projects" && m.value > 0
            ? "Review overdue projects"
            : m.metricId === "resources.utilization" && m.value > 100
              ? "Planned capacity exceeded"
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
  else if (selected?.purpose === "resources" && find("resources.utilization")) {
    const utilization = find("resources.utilization"),
      source = catalog.sources.find((s) => s.id === selected.sourceId),
      table = source?.tabs.find((t) => t.tabId === selected.tabId)?.table,
      assignedIndex = table?.headers.indexOf(
        utilization.lineage.fields.assigned_hours,
      ),
      availableIndex = table?.headers.indexOf(
        utilization.lineage.fields.available_hours,
      ),
      entityIndex = table?.headers.indexOf(
        utilization.lineage.fields.entity_id,
      );
    const assignedHours = table
        ? utilization.lineage.contributingRows.reduce(
            (sum, index) => sum + table.rows[index][assignedIndex],
            0,
          )
        : null,
      availableHours = table
        ? utilization.lineage.contributingRows.reduce(
            (sum, index) => sum + table.rows[index][availableIndex],
            0,
          )
        : null;
    performance = {
      kind: "resources",
      metrics: [{ ...utilization, label: "Planned utilization" }],
      series: [],
      capacity:
        assignedHours !== null && availableHours !== null
          ? {
              assignedHours,
              availableHours,
              remainingHours: availableHours - assignedHours,
              people: utilization.lineage.contributingRows
                .map((index) => {
                  const assigned = table.rows[index][assignedIndex];
                  const available = table.rows[index][availableIndex];
                  return {
                    id: String(table.rows[index][entityIndex]),
                    assignedHours: assigned,
                    availableHours: available,
                    remainingHours: available - assigned,
                    utilization:
                      available > 0 ? (assigned / available) * 100 : null,
                  };
                })
                .sort(
                  (a, b) =>
                    (b.utilization ?? -1) - (a.utilization ?? -1) ||
                    b.assignedHours - a.assignedHours ||
                    a.id.localeCompare(b.id),
                ),
            }
          : null,
    };
  }
  const unresolved = view.worksheets.filter(
    (w) =>
      w.confirmation?.enabled !== false &&
      !["reference", "other"].includes(
        w.confirmation?.purpose || w.proposal?.purpose,
      ) &&
      !w.executiveEligible,
  );
  const excludedScopes = new Set(
    view.worksheets
      .filter(
        (sheet) =>
          sheet.confirmation?.enabled === false ||
          ["reference", "other"].includes(sheet.confirmation?.purpose),
      )
      .map((sheet) => `${sheet.sourceId}:${sheet.tabId}`),
  );
  const blocked = view.metrics.filter(
    (metric) =>
      !excludedScopes.has(metric.scope) &&
      metric.state !== "validated" &&
      (!metric.entity ||
        view.registry.find((definition) => definition.id === metric.metricId)
          ?.entity === metric.entity),
  );
  const configuredBlocked = blocked.filter(
    (metric) =>
      configured.includes(metric.metricId) ||
      configured.includes(metric.name.toLowerCase()) ||
      configured.includes((labels[metric.metricId] || "").toLowerCase()),
  );
  const needsColumns = catalog.sources.some((source) =>
    source.tabs.some((tab) => !tab.skipped && !tab.table),
  );
  const state = valid.length
    ? "ready"
    : !needsColumns &&
        view.worksheets.length &&
        excludedScopes.size === view.worksheets.length
      ? "not_selected"
      : catalog.sources.length
        ? "review"
        : "empty";
  const provisional = blocked.some((metric) => metric.state === "provisional");
  const dataStatus = blocked.some((metric) => metric.state === "stale")
    ? "Data needs refresh"
    : needsColumns
      ? "Review column mapping"
      : provisional
        ? "Review business meanings"
        : configuredBlocked.length || (!valid.length && blocked.length)
          ? "Insufficient data"
          : unresolved.length
            ? "Review business meanings"
            : null;
  const reviewTarget =
    unresolved[0] ||
    view.worksheets.find((sheet) =>
      configuredBlocked.some(
        (metric) =>
          metric.lineage.sourceId === sheet.sourceId &&
          metric.lineage.tabId === sheet.tabId,
      ),
    );
  const diagnostics = view.worksheets.map((worksheet) => {
    const scope = `${worksheet.sourceId}:${worksheet.tabId}`,
      metrics = view.metrics.filter((metric) => metric.scope === scope),
      reasons = [
        ...new Set(
          metrics
            .filter((metric) => metric.state !== "validated")
            .flatMap((metric) => metric.reasons || []),
        ),
      ];
    if (!worksheet.confirmation)
      reasons.unshift(
        "Confirm this worksheet's business purpose and field meanings.",
      );
    else if (worksheet.confirmation.enabled === false)
      reasons.unshift("This worksheet is excluded from executive reporting.");
    else if (!worksheet.executiveEligible && !reasons.length)
      reasons.push(
        "No supported business measure passed validation for this worksheet.",
      );
    return {
      sourceId: worksheet.sourceId,
      tabId: worksheet.tabId,
      state: worksheet.executiveEligible
        ? "ready"
        : worksheet.state === "confirmed"
          ? "blocked"
          : "confirmation_required",
      reasons,
    };
  });
  const blockedReasons = [
    ...new Set(
      diagnostics
        .filter((item) => item.state !== "ready")
        .flatMap((item) => item.reasons),
    ),
  ];
  const reviewHref =
    base +
    (needsColumns
      ? "/connections?map=1"
      : dataStatus === "Data needs refresh"
        ? "/connections?refresh=1"
        : "/connections?business=1") +
    (reviewTarget
      ? `&source=${encodeURIComponent(reviewTarget.sourceId)}&tab=${reviewTarget.tabId}`
      : "");
  const resolution =
    state === "ready"
      ? null
      : state === "empty"
        ? {
            title: "Connect your first spreadsheet",
            explanation:
              "Aynor needs imported business records before it can calculate an executive report.",
            reasons: [],
            actionLabel: "Connect data",
            href: reviewHref,
          }
        : state === "not_selected"
          ? {
              title: "No executive reporting selected",
              explanation:
                "Your imported worksheets are available, but they are currently excluded from executive reporting.",
              reasons: blockedReasons,
              actionLabel: "Review business meanings",
              href: reviewHref,
            }
          : needsColumns
            ? {
                title: "Review column mapping",
                explanation:
                  "At least one imported worksheet has not produced a usable table, so supported measures cannot be validated.",
                reasons: blockedReasons,
                actionLabel: "Review column mapping",
                href: reviewHref,
              }
            : dataStatus === "Data needs refresh"
              ? {
                  title: "Refresh your business data",
                  explanation:
                    "The last imported records remain available, but Aynor will not present stale calculations as current performance.",
                  reasons: blockedReasons,
                  actionLabel: "Review data connection",
                  href: reviewHref,
                }
              : unresolved.length
                ? {
                    title: "Confirm your business reporting",
                    explanation:
                      "Aynor has imported the worksheet, but it needs confirmation of its business meaning before calculating executive measures.",
                    reasons: blockedReasons,
                    actionLabel: "Review business meanings",
                    href: reviewHref,
                  }
                : {
                    title: "Business data is incomplete",
                    explanation:
                      "The worksheet is connected and mapped, but no supported measure passed all required field, period, entity, and freshness checks.",
                    reasons:
                      blockedReasons.length > 0
                        ? blockedReasons
                        : [
                            "No reportable worksheet data reached semantic validation. Review the imported worksheet and its business meaning.",
                          ],
                    actionLabel: "Review business meanings",
                    href: reviewHref,
                  };
  return {
    version: 1,
    state,
    selectedScope: selected?.id || null,
    scopes: scopes.map(({ metrics, ...s }) => s),
    primary,
    performance,
    issues,
    additional: scopes
      .filter((s) => !selected || s.id !== selected.id)
      .map((s) => ({
        ...s,
        metrics: s.metrics.map((m) => ({
          ...m,
          label: labels[m.metricId],
        })),
      })),
    dataStatus:
      state === "not_selected" ? null : dataStatus || resolution?.title || null,
    diagnostics,
    resolution,
    reviewHref,
    summary: issues.length
      ? `${issues.length} supported ${issues.length === 1 ? "issue needs" : "issues need"} attention across confirmed reporting scopes.`
      : null,
  };
}
