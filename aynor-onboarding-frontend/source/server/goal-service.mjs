import {
  goalInputSchema,
  storedGoalsSchema,
  goalFields,
  periodKey,
} from "./goal-definition.mjs";
import { metricRegistry } from "./semantic-intelligence.mjs";
import { fail } from "./database.mjs";
import { dateInTimezone } from "../shared/sync-time.mjs";
const canonical = (v) =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canonical(v[k])]),
        )
      : v;
const same = (a, b) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const definitionOf = (g) =>
  Object.fromEntries(goalFields.map((k) => [k, g[k]]));
export function assessGoal(goal, metric, { binding, department, today }) {
  let reason = "",
    next = "";
  if (
    goal.binding.namespace !== binding?.namespace ||
    goal.binding.entity !== binding?.entity ||
    !binding?.namespace
  )
    reason =
      "The source identity mapping changed or is unconfirmed. Review the goal's metric binding.";
  else if (
    goal.protection.department !== department ||
    (goal.level === "department" && goal.department !== department)
  )
    reason =
      "The source department changed. Review the goal's reporting scope.";
  else if (
    !metric ||
    metric.state !== "validated" ||
    metric.value === null ||
    !Number.isFinite(metric.value)
  )
    reason =
      metric?.state === "stale"
        ? "The metric is stale. Refresh its source before assessing this goal."
        : "The metric is missing, unconfirmed or not validated. Review the supporting mapping and data.";
  else if (
    metric.scope !== goal.scope ||
    metric.unit !== goal.unit ||
    metric.currency !== goal.currency
  )
    reason =
      "The metric's reporting scope, unit or currency does not match the goal. No conversion is assumed.";
  else if (periodKey(metric.period) !== periodKey(goal.period))
    reason =
      "The metric's confirmed reporting period does not match the goal period.";
  if (reason)
    next =
      "Review the goal definition and supporting data in Data connections.";
  const available = !reason,
    actual = available ? metric.value : null;
  const atLeast =
    goal.direction === "increase" ||
    (goal.direction === "maintain" && goal.threshold === "at_least");
  const met = available
    ? atLeast
      ? actual >= goal.target
      : actual <= goal.target
    : null;
  let progress = null,
    progressExplanation = reason;
  if (available && goal.direction === "maintain")
    progressExplanation =
      "Threshold check for this confirmed period only; continuous adherence is not established.";
  else if (available && goal.baseline === null)
    progressExplanation =
      "Add an explicit baseline to calculate change progress. Actual and target remain comparable.";
  else if (available) {
    const delta = goal.target - goal.baseline;
    progress =
      Number.isFinite(delta) && Number.isFinite(actual - goal.baseline)
        ? 100 * ((actual - goal.baseline) / delta)
        : null;
    if (!Number.isFinite(progress)) progress = null;
    progressExplanation =
      progress === null
        ? "Change progress is outside supported numeric precision; actual and target remain comparable."
        : "Change progress = (actual − confirmed baseline) / (target − confirmed baseline) × 100. Values are not capped; negative progress means movement away from the target.";
  }
  const assessment = !available
    ? "Unassessed"
    : goal.direction === "maintain"
      ? met
        ? "Within threshold"
        : "Outside threshold"
      : met
        ? "Target met"
        : atLeast
          ? "Below target"
          : "Above target";
  return {
    actual,
    available,
    assessment,
    met,
    progress,
    progressExplanation,
    reason,
    next,
    deadlinePassed: today > goal.deadline,
    concern:
      available && !met && goal.lifecycle === "Active"
        ? {
            title:
              goal.direction === "maintain"
                ? "Outside confirmed threshold"
                : "Performance is off target",
            explanation: `Validated performance is ${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(Math.abs(actual - goal.target))} ${goal.unit === "percent" ? "percentage points" : goal.currency || goal.unit} ${actual < goal.target ? "below" : "above"} the configured target for this exact reporting period. This is a measured gap, not a forecast of deadline performance.`,
            next: "Investigate the contributing source records and review the target or operating response.",
          }
        : null,
  };
}
export function createGoalService({
  intelligence,
  db,
  now = () => Date.now(),
}) {
  const records = (state) => {
    const r = storedGoalsSchema.safeParse(
      state.companyData.governedGoals || [],
    );
    return r.success ? r.data : [];
  };
  return {
    async list(company, actor, context) {
      return intelligence.withAuthorizedState(
        company,
        actor,
        context,
        (state) => {
          const { report, policy } = state;
          const items = records(state)
            .filter(
              (g) =>
                policy.canReadProtectedFact(g.protection) &&
                (!report.context.scope || report.context.scope === g.scope) &&
                (!report.context.department ||
                  (g.level === "department"
                    ? g.department
                    : g.protection.department) === report.context.department),
            )
            .map((g) => {
              const entry = policy.scopes.get(g.scope),
                metric = report.metrics.find(
                  (m) => m.scope === g.scope && m.metricId === g.metricId,
                );
              const assessment = assessGoal(g, metric, {
                binding: {
                  namespace: entry?.tab.semantic?.entityNamespace,
                  entity: entry?.tab.semantic?.entity,
                },
                department: entry?.department || "",
                today: dateInTimezone(state.timezone, now()),
              });
              const { protection, binding, ...definition } = g;
              return {
                ...definition,
                ...assessment,
                metricName:
                  metricRegistry.find((m) => m.id === g.metricId)?.name ||
                  g.metricId,
                metricDefinition: metric?.definition || null,
                metricState: metric?.state || "unavailable",
                sourcePeriod: metric?.period || null,
                evidenceHref:
                  metric?.state === "validated"
                    ? `/companies/${company}/overview?scope=${encodeURIComponent(g.scope)}&evidence=${g.metricId}&source=${entry.source.id}&tab=${entry.tab.tabId}&revision=${report.datasetRevision}`
                    : null,
              };
            });
          return {
            version: 1,
            companyId: company,
            companyVersion: state.companyVersion,
            authorization: report.authorization,
            datasetRevision: report.datasetRevision,
            context: report.context,
            items,
          };
        },
      );
    },
    async save(company, actor, body) {
      const parsed = goalInputSchema.safeParse(body);
      if (!parsed.success)
        fail(400, parsed.error.issues[0]?.message || "Review the goal fields.");
      const input = parsed.data;
      return intelligence.withAuthorizedState(
        company,
        actor,
        {},
        async (state) => {
          const { policy, report } = state;
          if (!policy.admin) fail(403, "An Owner or Admin manages goals.");
          const all = records(state),
            existing = all.find((g) => g.id === input.id);
          const statusOnly =
            existing &&
            input.lifecycle !== existing.lifecycle &&
            same(
              { ...definitionOf(existing), lifecycle: input.lifecycle },
              definitionOf(input),
            );
          const entry = policy.scopes.get(input.scope),
            def = metricRegistry.find((m) => m.id === input.metricId),
            metric = report.metrics.find(
              (m) => m.scope === input.scope && m.metricId === input.metricId,
            );
          if (
            !statusOnly &&
            (!entry ||
              !def ||
              !metric ||
              def.unit !== input.unit ||
              def.periodKind !== input.period.kind)
          )
            fail(
              400,
              "Choose a supported metric, unit and period type for this source.",
            );
          if (
            !statusOnly &&
            input.level === "department" &&
            (input.department !== entry?.department ||
              !report.departments.includes(input.department))
          )
            fail(400, "The goal department must match its metric source.");
          const binding = {
            entity: statusOnly
              ? existing.binding.entity
              : entry?.tab.semantic?.entity || null,
            namespace: statusOnly
              ? existing.binding.namespace
              : entry?.tab.semantic?.entityNamespace || null,
          };
          if (
            existing &&
            input.version === 0 &&
            existing.version === 1 &&
            same(definitionOf(existing), definitionOf(input)) &&
            same(existing.binding, binding)
          )
            return {
              id: existing.id,
              version: existing.version,
              companyVersion: state.companyVersion,
            };
          if (
            input.version !== (existing?.version || 0) ||
            input.companyVersion !== state.companyVersion
          )
            fail(
              409,
              "Goal or company configuration changed. Refresh before saving.",
            );
          if (!existing && all.length >= 100)
            fail(400, "This company has reached the 100-goal limit.");
          const saved = {
            ...definitionOf(input),
            version: input.version + 1,
            binding,
            protection: statusOnly ? existing.protection : entry.protection,
            createdAt: existing?.createdAt || now(),
            updatedAt: now(),
          };
          const data = {
            ...state.companyData,
            governedGoals: [...all.filter((g) => g.id !== input.id), saved],
          };
          await db.rpc("company_update", {
            p_actor: actor,
            p_company: company,
            p_version: state.companyVersion,
            p_payload: data,
            p_profile: false,
          });
          return {
            id: saved.id,
            version: saved.version,
            companyVersion: state.companyVersion + 1,
          };
        },
      );
    },
  };
}
