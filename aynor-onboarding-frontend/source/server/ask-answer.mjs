import { askAnswerSchema } from "./ask-contracts.mjs";
import { compatibleComparison } from "./ask-facts.mjs";
import { periodKey } from "./goal-definition.mjs";
export const measure = (f) =>
  f.value === null || f.value === undefined
    ? "Not assessed"
    : f.unit === "currency"
      ? new Intl.NumberFormat("en", {
          style: "currency",
          currency: f.currency,
        }).format(f.value)
      : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(
          f.value,
        ) + (f.unit === "percent" ? "%" : "");
export const period = (p) =>
  !p
    ? "Unconfirmed period"
    : p.kind === "snapshot"
      ? `As of ${p.asOf}`
      : `${p.start} to ${p.endExclusive} (end exclusive)`;
export function factStatement(f) {
  if (f.kind === "metric")
    return `${f.label}: ${measure(f)}. ${f.state === "validated" ? f.definition : f.reason}.`;
  if (f.kind === "goal")
    return `${f.label}: administrator target ${measure({ ...f, value: f.target })}; ${f.state === "validated" ? `validated actual ${measure(f)}` : "actual unassessed"}; ${f.assessment}. ${f.progress === null ? "No change percentage is asserted." : `Change progress against the administrator baseline: ${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(f.progress)}%.`} Lifecycle: ${f.lifecycle}. Deadline: ${f.deadline}${f.deadlinePassed ? " (date passed; no deadline outcome is inferred)" : ""}.${f.ownerLabel ? ` Administrator-entered owner label: ${f.ownerLabel}.` : ""}`;
  if (f.kind === "recommendation")
    return `${f.label}. ${measure(f)}. ${f.definition} Recorded decision: ${f.status}; this is not proof of resolution.`;
  if (f.kind === "relationship") return `${f.label}. ${f.definition}`;
  return `${f.label}: ${measure(f)} distinct confirmed project references. ${f.definition}`;
}
const clarificationText = {
  none: null,
  period:
    "Which confirmed reporting period should I use? The available periods are shown with the facts; I will not silently substitute a different period.",
  scope:
    "Which department or reporting scope should I use? I can only include data within your authorized selection.",
  metric:
    "I cannot establish the requested information from the available authorized evidence. Choose a supported measure or confirm the relevant source.",
  cause_not_established:
    "These records do not establish a cause. I can explain the recorded calculation, concerns and dependencies, and guide investigation without guessing why it happened.",
  forecast_not_supported:
    "A validated forecast is not available. Current observations and goal assessments do not establish a future outcome.",
};
export function resolvePlan(raw, bundle, allowed) {
  const parsed = askAnswerSchema.safeParse(raw);
  if (!parsed.success || parsed.data.select) throw Error("invalid_answer");
  const plan = parsed.data;
  if (
    !plan.facts.length &&
    !plan.reasoning.length &&
    plan.clarification === "none"
  )
    throw Error("empty_answer");
  const lookup = new Map(allowed.map((f) => [f.ref, f]));
  const used = [
    ...new Set([...plan.facts, ...plan.reasoning.flatMap((r) => r.facts)]),
  ];
  if (used.length > 12 || used.some((id) => !lookup.has(id)))
    throw Error("invalid_citation");
  const interpretations = [],
    steps = [];
  for (const op of plan.reasoning) {
    const fs = op.facts.map((id) => lookup.get(id));
    let text;
    if (op.type === "financial_bridge") {
      const allowedIds = [
        "finance.revenue",
        "finance.expenses",
        "finance.profit",
        "finance.margin",
      ];
      if (
        fs.length < 2 ||
        !fs.every(
          (f) =>
            f.kind === "metric" &&
            f.state === "validated" &&
            allowedIds.includes(f.metricId) &&
            f.scopes[0] === fs[0].scopes[0] &&
            f.currency === fs[0].currency &&
            periodKey(f.period) === periodKey(fs[0].period),
        )
      )
        throw Error("incompatible_explanation");
      text =
        "These financial measures share one confirmed scope, currency and reporting period. Operating profit is recognized revenue minus operating expenses; operating margin relates that result to revenue. This explains the accounting relationship, not an unrecorded cause of a change.";
    } else if (op.type === "compare") {
      if (
        !compatibleComparison(fs) ||
        new Set(fs.map((f) => f.scopes[0])).size !== fs.length
      )
        throw Error("incompatible_comparison");
      const ordered = [...fs].sort((a, b) => b.value - a.value);
      text =
        ordered[0].value === ordered.at(-1).value
          ? "The validated values are equal in these compatible reporting scopes."
          : `${ordered[0].department || "The first cited scope"} has the higher recorded ${ordered[0].label.toLowerCase()} among the cited scopes. This is a comparison of recorded values, without adjusting for department size, coverage or operating model.`;
    } else if (op.type === "goal_progress") {
      if (!fs.every((f) => f.kind === "goal")) throw Error("invalid_reasoning");
      text = fs.some((f) => f.state !== "validated")
        ? "Goal progress cannot be established where source data and the configured target are not compatible. Review the goal definition before treating an unavailable actual as performance."
        : "Targets and baselines are administrator-defined references; actual performance comes from validated metrics. Change progress measures movement from that baseline toward the target. A threshold is assessed by its configured bound, not by increasing a percentage. A passed deadline alone does not prove a missed or achieved outcome.";
    } else if (op.type === "shared_dependency") {
      if (!fs.every((f) => ["relationship", "dependency"].includes(f.kind)))
        throw Error("invalid_reasoning");
      const rels = fs.filter((f) => f.kind === "relationship");
      if (
        !fs.some((f) => f.kind === "dependency") &&
        rels.length > 1 &&
        new Set(rels.map((f) => f.to)).size !== 1
      )
        throw Error("unconfirmed_shared_dependency");
      text =
        "The cited references are confirmed identity matches, not name-based assumptions. Shared project references are a reason to review commitments; they do not prove scheduling overlap, insufficient capacity or a delivery delay.";
    } else if (op.type === "separate_observations") {
      if (fs.length < 2 || !fs.every((f) => f.state === "validated"))
        throw Error("invalid_reasoning");
      text =
        "These are supported observations in their individually stated reporting scopes and periods. Reviewing them together can guide investigation, but no causal link or combined total is established by these records.";
    } else {
      if (
        !fs.every((f) =>
          ["goal", "recommendation", "dependency", "relationship"].includes(
            f.kind,
          ),
        )
      )
        throw Error("invalid_reasoning");
      text =
        "Start with the cited source evidence and the recorded definition or recommendation. Confirm the current business situation before choosing an operating response; no external action has been taken.";
    }
    interpretations.push({ text, citations: op.facts });
  }
  for (const id of used) {
    const f = lookup.get(id);
    if (f.next && steps.length < 4 && !steps.some((s) => s.text === f.next))
      steps.push({ text: f.next, citations: [id], href: f.href });
  }
  return {
    facts: used.map((id) => {
      const f = lookup.get(id);
      return {
        id: f.ref,
        stableId: f.id,
        kind: f.kind,
        label: f.label,
        statement: factStatement(f),
        department: f.department,
        period: period(f.period),
        state: f.state,
        href: f.href,
        evidenceHref: f.evidenceHref || null,
      };
    }),
    interpretations,
    steps,
    clarification: clarificationText[plan.clarification],
    selected: used.map((id) => lookup.get(id).id),
  };
}
export function localSelection(question, bundle, previous = [], focus) {
  const q = question.toLowerCase(),
    tokens = q.match(/[a-z]{3,}/g) || [];
  const scored = bundle.facts
    .map((f, i) => {
      const hay = [
        f.kind,
        f.label,
        f.metricId,
        f.department,
        f.from,
        f.to,
        f.entity,
      ]
        .join(" ")
        .toLowerCase();
      let score = tokens.filter((t) => hay.includes(t)).length;
      if (previous.includes(f.id)) score += 4;
      if (focus && [f.id, f.metricId, f.originId].includes(focus)) score += 12;
      if (/goal|target|objective/.test(q) && f.kind === "goal") score += 6;
      if (
        /depend|resource|rely|share|project/.test(q) &&
        ["dependency", "relationship"].includes(f.kind)
      )
        score += 4;
      if (
        /attention|concern|priorit|next|recommend|worry/.test(q) &&
        ["recommendation", "dependency", "goal"].includes(f.kind)
      )
        score += 4;
      return { f, score, i };
    })
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return scored
    .filter((x) => x.score > 0)
    .slice(0, 8)
    .map((x) => x.f);
}
export function fallbackAnswer(question, bundle, previous, focus) {
  let chosen = localSelection(question, bundle, previous, focus);
  if (
    !chosen.length &&
    /summary|overview|performance|business|attention/i.test(question)
  )
    chosen = bundle.facts.filter((f) => f.state === "validated").slice(0, 6);
  const unsupported = /forecast|predict|next year|will we|will .*miss/i.test(
    question,
  )
    ? "forecast_not_supported"
    : /\bwhy\b|cause|causing/i.test(question)
      ? "cause_not_established"
      : chosen.length
        ? "none"
        : "metric";
  const validated = chosen.filter((f) => f.state === "validated");
  const finance = validated.filter(
    (f) =>
      f.kind === "metric" &&
      [
        "finance.revenue",
        "finance.expenses",
        "finance.profit",
        "finance.margin",
      ].includes(f.metricId),
  );
  const financeCompatible =
    finance.length >= 2 &&
    finance.every(
      (f) =>
        f.scopes[0] === finance[0].scopes[0] &&
        f.currency === finance[0].currency &&
        periodKey(f.period) === periodKey(finance[0].period),
    );
  const goals = validated.filter((f) => f.kind === "goal");
  const reasoning = financeCompatible
    ? [{ type: "financial_bridge", facts: finance.slice(0, 4).map((f) => f.ref) }]
    : goals.length && /goal|target|objective|progress/i.test(question)
      ? [{ type: "goal_progress", facts: goals.slice(0, 4).map((f) => f.ref) }]
      : validated.length >= 2
        ? [{ type: "separate_observations", facts: validated.slice(0, 4).map((f) => f.ref) }]
        : [];
  const answer = resolvePlan(
    {
      facts: chosen.map((f) => f.ref),
      reasoning,
      clarification: unsupported,
    },
    bundle,
    bundle.facts,
  );
  return answer;
}
// Relative periods are guards, never instructions to calculate a new calendar total from arbitrary rows.
export function unavailableRelativePeriod(question, bundle) {
  const q = question.toLowerCase();
  const date = new Date(bundle.today + "T00:00:00Z");
  let start, end;
  if (/\b(this|last) month\b/.test(q)) {
    const back = /last month/.test(q) ? 1 : 0;
    start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back, 1),
    );
    end = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back + 1, 1),
    );
  } else if (/\b(this|last) week\b/.test(q)) {
    const back = /last week/.test(q) ? 7 : 0;
    const day = (date.getUTCDay() + 6) % 7;
    start = new Date(+date - (day + back) * 86400000);
    end = new Date(+start + 7 * 86400000);
  } else if (/\b(today|yesterday)\b/.test(q)) {
    const asOf = new Date(+date - (/yesterday/.test(q) ? 86400000 : 0))
      .toISOString()
      .slice(0, 10);
    return !bundle.facts.some(
      (f) => f.period?.kind === "snapshot" && f.period.asOf === asOf,
    );
  } else return false;
  return !bundle.facts.some(
    (f) =>
      f.period?.kind === "interval" &&
      f.period.start === start.toISOString().slice(0, 10) &&
      f.period.endExclusive === end.toISOString().slice(0, 10),
  );
}
