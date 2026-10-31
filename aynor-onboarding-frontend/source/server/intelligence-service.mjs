import { evaluateSemantics } from "./semantic-intelligence.mjs";
import { buildExecutiveReport } from "./executive-presentation.mjs";
import { intelligencePolicy, digest } from "./intelligence-policy.mjs";
import { fail } from "./database.mjs";
export function reportingContext(input = {}) {
  const entries =
    input instanceof URLSearchParams
      ? [...input]
      : Object.entries(input).flatMap(([k, v]) =>
          Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]],
        );
  const filters = {};
  for (const [key, value] of entries) {
    if (["view", "revision", "metricId", "sourceId", "tabId"].includes(key))
      continue;
    if (
      ![
        "scope",
        "department",
        "period",
        "filter",
        "status",
        "q",
        "tag",
      ].includes(key)
    )
      fail(400, "Unsupported reporting context.");
    if (typeof value !== "string" || value.length > 500)
      fail(400, "Invalid reporting context.");
    (filters[key] ||= []).push(value);
  }
  for (const key of ["scope", "department", "period"])
    if (filters[key]?.length > 1)
      fail(400, "Choose one reporting scope, department and period.");
  const canonical = Object.fromEntries(
    Object.entries(filters).sort(([a], [b]) => a.localeCompare(b)),
  );
  return {
    scope: filters.scope?.[0] || "",
    department: filters.department?.[0] || "",
    period: filters.period?.[0] || "all",
    filters: canonical,
    key: digest(canonical),
    periodBasis:
      "confirmed semantic period; request period is navigation context, not an implicit recalculation",
    filterBasis:
      "scope and department select reporting scopes; other retained filters do not alter calculated metrics",
  };
}
export function createIntelligenceService({ read, now = () => Date.now() }) {
  async function load(company, actor, input = {}) {
    const state = await read(company, actor);
    if (!state?.company || state.company.id !== company)
      fail(403, "Workspace unavailable for your current access.");
    const policy = intelligencePolicy(state, actor),
      context = reportingContext(input);
    if (context.scope) policy.require(context.scope);
    if (
      context.department &&
      ![...policy.scopes.values()].some(
        (x) => x.department === context.department,
      )
    )
      fail(403, "Department unavailable for your current access.");
    const visible = new Map(
      [...policy.scopes].filter(
        ([id, x]) => !context.department || x.department === context.department,
      ),
    );
    if (context.scope && !visible.has(context.scope))
      fail(400, "Reporting scope and department do not match.");
    const revision = digest([
      state.snapshot?.revision ?? 0,
      state.connection?.revision ?? 0,
      state.company.version,
      digest(state.catalog),
    ]);
    return { state, policy, context, visible, revision, company };
  }
  function metadata(s) {
    return {
      datasetRevision: s.revision,
      authorization: {
        fingerprint: s.policy.fingerprint,
        role: s.policy.role,
        canManageSources: s.policy.admin,
      },
      context: s.context,
    };
  }
  function projectMetric(metric, s) {
    if (s.policy.admin) return metric;
    const allowed = s.policy.require(metric.scope).columns;
    return {
      ...metric,
      reasons:
        metric.state === "validated"
          ? []
          : ["This measure requires administrator review."],
      lineage: {
        ...metric.lineage,
        fields: Object.fromEntries(
          Object.entries(metric.lineage.fields).filter(([, h]) =>
            allowed.includes(h),
          ),
        ),
      },
    };
  }
  function calculate(s) {
    // Validate the entire trusted snapshot first, retaining overlap/currency safeguards.
    const full = evaluateSemantics({
      catalog: {
        ...s.state.catalog,
        revision: s.state.snapshot?.revision ?? s.state.connection?.revision,
      },
      companyId: s.company,
      settings: s.state.catalog.semanticSettings || {},
      timezone: s.state.company.profile?.timezone || "UTC",
      now: now(),
    });
    const view = {
      ...full,
      worksheets: full.worksheets.filter((w) =>
        s.visible.has(`${w.sourceId}:${w.tabId}`),
      ),
      metrics: full.metrics.filter((m) => s.visible.has(m.scope)),
    };
    const catalog = {
      ...s.state.catalog,
      sources: s.state.catalog.sources
        .map((source) => ({
          ...source,
          tabs: source.tabs.filter((tab) =>
            s.visible.has(`${source.id}:${tab.tabId}`),
          ),
        }))
        .filter((source) => source.tabs.length),
    };
    const executive = buildExecutiveReport(
      view,
      { ...s.state.company, ...s.state.company.profile, id: s.company },
      catalog,
      s.context.scope,
    );
    // Do not expose per-record chart observations without permission to their columns.
    if (!s.policy.admin && executive.performance?.series?.length) {
      const scope = s.policy.scopes.get(executive.selectedScope);
      if (
        !["date", "revenue", "expense"].every(
          (f) =>
            !scope.tab.semantic.fields[f] ||
            scope.columns.includes(scope.tab.semantic.fields[f]),
        )
      )
        executive.performance.series = [];
    }
    const decorate = (m) => projectMetric(m, s);
    executive.primary = executive.primary.map(decorate);
    if (executive.performance)
      executive.performance.metrics =
        executive.performance.metrics.map(decorate);
    executive.issues = executive.issues.map((issue) => ({
      ...issue,
      metric: decorate(issue.metric),
      href: issue.href + "&revision=" + s.revision,
    }));
    executive.additional = executive.additional.map((scope) => ({
      ...scope,
      metrics: scope.metrics.map(decorate),
    }));
    return {
      ...view,
      worksheets: s.policy.admin
        ? view.worksheets
        : view.worksheets.map(
            ({ sourceId, tabId, department, state, executiveEligible }) => ({
              sourceId,
              tabId,
              department,
              state,
              executiveEligible,
            }),
          ),
      metrics: view.metrics.map(decorate),
      executive,
      ...metadata(s),
    };
  }
  async function evaluate(company, actor, input) {
    return calculate(await load(company, actor, input));
  }
  return {
    async context(company, actor, input) {
      const s = await load(company, actor, input);
      return { version: 1, companyId: company, ...metadata(s) };
    },
    evaluate,
    async snapshot(company, actor, input) {
      const v = await evaluate(company, actor, input);
      return {
        version: v.version,
        companyId: v.companyId,
        evaluatedAt: v.evaluatedAt,
        datasetRevision: v.datasetRevision,
        authorization: v.authorization,
        context: v.context,
        metrics: v.metrics,
        concerns: v.executive.issues,
        scopes: v.executive.scopes,
        executive: v.executive,
      };
    },
    async evidence(
      company,
      actor,
      { sourceId, tabId, metricId, revision, legacy = false, ...context },
    ) {
      const s = await load(company, actor, context),
        scope = s.policy.require(`${sourceId}:${Number(tabId)}`);
      if (!s.visible.has(`${sourceId}:${Number(tabId)}`))
        fail(403, "Evidence is outside the selected department.");
      if ((!revision && !legacy) || (revision && revision !== s.revision))
        fail(
          409,
          "This evidence version has changed. Refresh the report before investigating.",
        );
      const view = calculate(s),
        metric = view.metrics.find(
          (m) =>
            m.metricId === metricId &&
            m.scope === `${sourceId}:${Number(tabId)}`,
        );
      if (!metric || metric.state !== "validated")
        fail(
          409,
          "This evidence needs review or refresh before it supports an investigation.",
        );
      const columns = [
        ...new Set(
          Object.entries(metric.lineage.fields)
            .filter(
              ([role, header]) =>
                !role.endsWith("_name") ||
                scope.tab.table.types[
                  scope.tab.table.headers.indexOf(header)
                ] === "text",
            )
            .map(([, h]) => h),
        ),
      ];
      if (!s.policy.admin && !columns.length)
        fail(403, "Record columns are not authorized.");
      return {
        metric,
        columns,
        rows: metric.lineage.contributingRows
          .slice(0, 100)
          .map((i) =>
            columns.map(
              (h) =>
                scope.tab.table.rows[i][scope.tab.table.headers.indexOf(h)],
            ),
          ),
        total: metric.lineage.contributingRows.length,
        sourceTitle: scope.source.title,
        tabTitle: scope.tab.title,
        ...metadata(s),
      };
    },
    async records(company, actor, { scope, revision, ...context }) {
      const s = await load(company, actor, { ...context, scope }),
        entry = s.policy.require(scope);
      if (!revision || revision !== s.revision)
        fail(409, "Source records changed. Refresh the report.");
      const columns = s.policy.admin ? entry.tab.table?.headers : entry.columns;
      if (!columns?.length || !entry.tab.table)
        fail(403, "Source record columns are not authorized.");
      const existing = columns.filter((h) =>
        entry.tab.table.headers.includes(h),
      );
      return {
        columns: existing,
        rows: entry.tab.table.rows
          .slice(0, 100)
          .map((row) =>
            existing.map((h) => row[entry.tab.table.headers.indexOf(h)]),
          ),
        total: entry.tab.table.rows.length,
        ...metadata(s),
      };
    },
    async relationships(company, actor, input) {
      const s = await load(company, actor, input);
      return {
        relationships: [],
        state: "not_configured",
        reason:
          "Confirmed business relationship contracts will be connected in Milestone 4C.",
        ...metadata(s),
      };
    },
  };
}
