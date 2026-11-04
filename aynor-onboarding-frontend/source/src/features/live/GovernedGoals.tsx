import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api as workspaceApi, type Company, type Goal } from "../../lib/api";
import { Button, ErrorBox, Field, Modal } from "../../components/ui";
import { serverRequest } from "../../lib/runtime";
import { Panel, Blank, Status } from "../intelligence/shared";
import {
  GovernedModule,
  useGovernedModule,
  EvidenceLink,
} from "./GovernedModule";
import { intelligenceQuery } from "./intelligence-cache";
import {
  displayMetric,
  displayPeriod,
  type SemanticPeriod,
} from "./semantic-types";
import type { GoalDefinition, GovernedGoal, GoalView } from "./goal-types";
type Draft = Omit<GoalDefinition, "target" | "baseline"> & {
  target: string;
  baseline: string;
};
const definitionKeys = [
  "id",
  "version",
  "title",
  "description",
  "level",
  "department",
  "scope",
  "metricId",
  "target",
  "unit",
  "currency",
  "period",
  "deadline",
  "owner",
  "direction",
  "threshold",
  "baseline",
  "lifecycle",
] as const;
const definition = (g: GovernedGoal): GoalDefinition =>
  Object.fromEntries(definitionKeys.map((k) => [k, g[k]])) as GoalDefinition;
const toDraft = (g: GoalDefinition): Draft => ({
  ...g,
  target: String(g.target),
  baseline: g.baseline === null ? "" : String(g.baseline),
});
export function GovernedGoals({
  company,
  updateCompany,
}: {
  company: Company;
  updateCompany?: (company: Company) => void;
}) {
  const m = useGovernedModule(company),
    location = useLocation(),
    id = location.pathname.split("/")[4] || "",
    root = m.base + "/goals",
    api = m.base + "/intelligence/goals";
  const [stored, setStored] = useState<{ key: string; view: GoalView } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0);
  const [onboardingDraft, setOnboardingDraft] = useState<Goal | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null),
    [saving, setSaving] = useState(false),
    [writeError, setWriteError] = useState(""),
    [success, setSuccess] = useState("");
  const key = m.report
    ? JSON.stringify([
        m.report.authorization.fingerprint,
        m.report.context.key,
        m.report.datasetRevision,
      ])
    : "";
  const view = stored?.key === key ? stored.view : null,
    goal = view?.items.find((g) => g.id === id),
    onboardingGoal = view?.onboarding?.find((g) => g.id === id),
    admin = m.report?.authorization.canManageSources || false;
  useEffect(() => {
    setDraft(null);
    setOnboardingDraft(null);
    setWriteError("");
    setSuccess("");
  }, [company.id, id]);
  useEffect(() => {
    if (!m.report) return;
    let active = true;
    setBusy(true);
    setError("");
    serverRequest<GoalView>(api + "?" + intelligenceQuery(location.search))
      .then((v) => {
        if (!active) return;
        if (
          v.companyId !== company.id ||
          v.authorization.fingerprint !== m.report!.authorization.fingerprint ||
          v.datasetRevision !== m.report!.datasetRevision ||
          v.context.key !== m.report!.context.key
        ) {
          setStored(null);
          m.retry();
          return;
        }
        setStored({ key, view: v });
      })
      .catch((e) => {
        if (active) {
          setStored(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [m.report, refresh, api, location.search]);
  const pending = busy || (!!m.report && !view && !error);
  const metricOptions = m.report?.metrics || [];
  const scopeName = (scope: string) =>
    m.report?.scopes.find((s) => s.id === scope)?.label || scope;
  const value = (v: number | null, g: GoalDefinition) =>
    displayMetric({ value: v, unit: g.unit, currency: g.currency });
  async function save(input: GoalDefinition) {
    if (!view || saving) return;
    setSaving(true);
    setWriteError("");
    try {
      await serverRequest(api, "POST", {
        ...input,
        companyVersion: view.companyVersion,
      });
      if (updateCompany)
        await workspaceApi<Company>(m.base)
          .then(updateCompany)
          .catch(() => {});
      setDraft(null);
      setSuccess(
        "Goal saved. Performance is assessed from validated source data.",
      );
      m.retry();
      setRefresh((v) => v + 1);
    } catch (e) {
      setWriteError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function saveOnboarding() {
    if (!onboardingDraft || !view || saving) return;
    setSaving(true);
    setWriteError("");
    try {
      await serverRequest(api + "/onboarding", "POST", {
        ...onboardingDraft,
        companyVersion: view.companyVersion,
      });
      if (updateCompany)
        await workspaceApi<Company>(m.base)
          .then(updateCompany)
          .catch(() => {});
      setOnboardingDraft(null);
      setSuccess(
        "Goal definition saved. Metric confirmation is still required before calculating progress.",
      );
      m.retry();
      setRefresh((v) => v + 1);
    } catch (e) {
      setWriteError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function start() {
    setWriteError("");
    setDraft({
      id: crypto.randomUUID(),
      version: 0,
      title: "",
      level: m.query.get("department") ? "department" : "company",
      department: m.query.get("department") || "",
      scope: "",
      metricId: "",
      target: "",
      unit: "count",
      currency: null,
      period: { kind: "interval", start: "", endExclusive: "" },
      deadline: "",
      owner: "",
      direction: "increase",
      threshold: "at_least",
      baseline: "",
      lifecycle: "Active",
    });
  }
  function confirmOnboarding(g: Goal) {
    start();
    setDraft((d) =>
      d
        ? {
            ...d,
            id: g.id,
            title: g.name,
            description: g.description || "",
            owner: g.owner,
            deadline: g.deadline,
            target: /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(g.target.trim())
              ? g.target.trim()
              : "",
          }
        : d,
    );
  }
  const pendingGoals = (view?.onboarding || []).filter(
    (g) =>
      (!m.query.get("status") || m.query.get("status") === "All") &&
      (!m.query.get("q") ||
        `${g.name} ${g.owner} ${g.kpi}`
          .toLowerCase()
          .includes(m.query.get("q")!.toLowerCase())),
  );
  const filtered = (view?.items || []).filter((g) => {
    const status = m.query.get("status");
    return (
      (!status ||
        status === "All" ||
        (status === "Completed"
          ? g.assessment === "Target met"
          : g.lifecycle === status)) &&
      (!m.query.get("q") ||
        `${g.title} ${g.metricName} ${g.owner}`
          .toLowerCase()
          .includes(m.query.get("q")!.toLowerCase()))
    );
  });
  return (
    <GovernedModule
      title={goal?.title || onboardingGoal?.name || "Goals"}
      description="Targets and validated business performance."
      module={m}
      showContextFilters={false}
      back={id ? m.back || m.link(root) : undefined}
      actions={
        admin && !id ? <Button onClick={start}>Create goal</Button> : undefined
      }
    >
      {error && !m.error && (
        <>
          <ErrorBox>{error}</ErrorBox>
          <Button variant="secondary" onClick={() => setRefresh((v) => v + 1)}>
            Retry goals
          </Button>
        </>
      )}
      {pending && (
        <p role="status">
          {view ? "Updating goals…" : "Loading authorized goals…"}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {id ? (
        goal ? (
          <>
            <div className="intel-action-state">
              <Status>{goal.lifecycle}</Status>
              <Status>{goal.assessment}</Status>
            </div>
            <div className="intel-kpi-grid">
              <div className="intel-kpi">
                <span>Target</span>
                <strong>{value(goal.target, goal)}</strong>
                <small>
                  {goal.direction === "increase"
                    ? "Reach at least"
                    : goal.direction === "decrease"
                      ? "Reduce to at most"
                      : goal.threshold === "at_least"
                        ? "Maintain at least"
                        : "Maintain at most"}
                </small>
              </div>
              <div className="intel-kpi">
                <span>Actual performance</span>
                <strong>{value(goal.actual, goal)}</strong>
                <small>{goal.available ? "Validated" : "Unassessed"}</small>
              </div>
              <div className="intel-kpi">
                <span>
                  {goal.direction === "maintain"
                    ? "Threshold check"
                    : "Change progress"}
                </span>
                <strong>
                  {goal.direction === "maintain"
                    ? goal.assessment
                    : goal.progress === null
                      ? "Not calculated"
                      : new Intl.NumberFormat("en", {
                          maximumFractionDigits: 1,
                        }).format(goal.progress) + "%"}
                </strong>
                <small>
                  {goal.baseline === null
                    ? "No change baseline"
                    : `Baseline: ${value(goal.baseline, goal)}`}
                </small>
              </div>
            </div>
            <Panel title="Goal definition">
              <p>
                {goal.level === "company"
                  ? "Company goal"
                  : "Department goal · " + goal.department}{" "}
                · {goal.metricName}
              </p>
              <p>
                {scopeName(goal.scope)} · {displayPeriod(goal.period)}
              </p>
              {goal.description && <p>{goal.description}</p>}
              {goal.onboardingDefinition && (
                <details>
                  <summary>Original onboarding definition</summary>
                  <p>Target as entered: {goal.onboardingDefinition.target}</p>
                  <p>
                    Measure as entered:{" "}
                    {goal.onboardingDefinition.kpi || "Not specified"}
                  </p>
                  <p>{goal.onboardingDefinition.description}</p>
                  <p>
                    Owner as entered:{" "}
                    {goal.onboardingDefinition.owner || "Not specified"} ·
                    Deadline: {goal.onboardingDefinition.deadline}
                  </p>
                </details>
              )}
              {goal.currency && <p>Currency context: {goal.currency}</p>}
              <p>
                Deadline: {goal.deadline}
                {goal.deadlinePassed ? " · Deadline passed" : ""}
              </p>
              {goal.owner && (
                <p>Owner (administrator assigned): {goal.owner}</p>
              )}
              {goal.available && <p>{goal.progressExplanation}</p>}
              {goal.metricDefinition && <p>{goal.metricDefinition}</p>}
              {goal.sourcePeriod && (
                <p>
                  Source reporting period: {displayPeriod(goal.sourcePeriod)}
                </p>
              )}
            </Panel>
            {!goal.available && (
              <Panel title="Performance needs review">
                <p>{goal.reason}</p>
                <p>{goal.next}</p>
                {admin && (
                  <>
                    <Link to={m.link(m.base + "/connections?map=1", m.origin)}>
                      Review data connections
                    </Link>
                  </>
                )}
              </Panel>
            )}
            {goal.concern && (
              <Panel title={goal.concern.title}>
                <p>{goal.concern.explanation}</p>
                <p>{goal.concern.next}</p>
              </Panel>
            )}
            {goal.evidenceHref && (
              <Panel title="Supporting evidence">
                {!goal.available && (
                  <p>
                    Current source measure only; these records do not establish
                    progress for this goal.
                  </p>
                )}
                <EvidenceLink
                  companyId={company.id}
                  href={goal.evidenceHref}
                  search={location.search}
                  origin={m.origin}
                />
              </Panel>
            )}
            {admin && (
              <Panel title="Manage goal">
                <ErrorBox>{!draft ? writeError : ""}</ErrorBox>
                <div className="intel-footer-actions">
                  <Button
                    onClick={() => {
                      setWriteError("");
                      setDraft(toDraft(definition(goal)));
                    }}
                  >
                    Edit goal
                  </Button>
                  {(["Active", "Paused", "Archived"] as const)
                    .filter((s) => s !== goal.lifecycle)
                    .map((s) => (
                      <Button
                        key={s}
                        variant="secondary"
                        busy={saving}
                        onClick={() =>
                          save({ ...definition(goal), lifecycle: s })
                        }
                      >
                        {s === "Active"
                          ? "Resume goal"
                          : s === "Paused"
                            ? "Pause goal"
                            : "Archive goal"}
                      </Button>
                    ))}
                </div>
                <p>
                  Goal status is managed separately from measured target
                  attainment.
                </p>
              </Panel>
            )}
          </>
        ) : onboardingGoal ? (
          <Panel title="Goal definition — metric confirmation needed">
            <p>Target as entered: {onboardingGoal.target}</p>
            {onboardingGoal.description && <p>{onboardingGoal.description}</p>}
            {onboardingGoal.kpi && (
              <p>Measure as entered: {onboardingGoal.kpi}</p>
            )}
            <p>Deadline: {onboardingGoal.deadline}</p>
            {onboardingGoal.owner && (
              <p>Owner (administrator assigned): {onboardingGoal.owner}</p>
            )}
            <p>
              This saved onboarding goal has no confirmed metric, unit or
              reporting period. Actual performance and progress are not
              calculated.
            </p>
            <ErrorBox>{!onboardingDraft && !draft ? writeError : ""}</ErrorBox>
            <div className="intel-footer-actions">
              <Button
                onClick={() => {
                  setWriteError("");
                  setOnboardingDraft({ ...onboardingGoal });
                }}
              >
                Edit goal definition
              </Button>
              <Button
                variant="secondary"
                onClick={() => confirmOnboarding(onboardingGoal)}
              >
                Confirm goal metric
              </Button>
            </div>
          </Panel>
        ) : !pending && !error ? (
          <Blank
            title="Goal unavailable"
            text="This goal is unavailable or outside your current reporting scope and access."
          />
        ) : null
      ) : (
        <>
          <div className="intel-kpi-grid" aria-label="Goal status summary">
            <div className="intel-kpi">
              <span>Active</span>
              <strong>
                {(view?.items || []).filter((g) => g.lifecycle === "Active")
                  .length + (view?.onboarding || []).length}
              </strong>
            </div>
            <div className="intel-kpi">
              <span>Completed</span>
              <strong>
                {
                  (view?.items || []).filter(
                    (g) => g.assessment === "Target met",
                  ).length
                }
              </strong>
            </div>
            <div className="intel-kpi">
              <span>Archived</span>
              <strong>
                {
                  (view?.items || []).filter((g) => g.lifecycle === "Archived")
                    .length
                }
              </strong>
            </div>
          </div>
          <div className="intel-toolbar">
            <input
              aria-label="Find a goal"
              placeholder="Find a goal"
              value={m.query.get("q") || ""}
              onChange={(e) => m.change("q", e.target.value)}
            />
            <select
              aria-label="Goal status filter"
              value={m.query.get("status") || "All"}
              onChange={(e) => m.change("status", e.target.value)}
            >
              {["All", "Active", "Completed", "Paused", "Archived"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <Panel title="Business goals">
            {filtered.map((g) => (
              <Link
                className="intel-row"
                key={g.id}
                to={m.link(root + "/" + g.id, m.origin)}
              >
                <span>
                  {g.title}
                  <small>
                    {g.level === "company" ? "Company" : g.department} ·{" "}
                    {g.metricName} · {displayPeriod(g.period)}
                  </small>
                  <small>
                    Actual: {value(g.actual, g)} · Target: {value(g.target, g)}{" "}
                    · {g.lifecycle}
                  </small>
                </span>
                <Status>{g.assessment}</Status>
              </Link>
            ))}
            {pendingGoals.map((g) => (
              <Link
                className="intel-row"
                key={g.id}
                to={m.link(root + "/" + g.id, m.origin)}
              >
                <span>
                  {g.name}
                  <small>
                    Target as entered: {g.target} · Due {g.deadline}
                  </small>
                  {g.owner && (
                    <small>Owner (administrator assigned): {g.owner}</small>
                  )}
                </span>
                <Status>Metric confirmation needed</Status>
              </Link>
            ))}
            {!filtered.length && !pendingGoals.length && !pending && !error && (
              <Blank
                title={
                  view?.items.length
                    ? "No goals in this view"
                    : "No governed goals yet"
                }
                text={
                  view?.items.length
                    ? "Adjust the goal status or search filter."
                    : "An Owner or Admin can define targets against an authorized business metric. Progress appears only when validated data matches the goal."
                }
              />
            )}
          </Panel>
        </>
      )}
      {onboardingDraft && (
        <Modal
          title="Edit onboarding goal definition"
          onClose={() => {
            if (!saving) setOnboardingDraft(null);
          }}
        >
          <ErrorBox>{writeError}</ErrorBox>
          <Field
            label="Goal name"
            value={onboardingDraft.name}
            disabled={saving}
            onChange={(e) =>
              setOnboardingDraft({ ...onboardingDraft, name: e.target.value })
            }
          />
          <Field
            label="Target as entered"
            value={onboardingDraft.target}
            disabled={saving}
            onChange={(e) =>
              setOnboardingDraft({ ...onboardingDraft, target: e.target.value })
            }
          />
          <Field
            label="Measure as entered (optional)"
            value={onboardingDraft.kpi}
            disabled={saving}
            onChange={(e) =>
              setOnboardingDraft({ ...onboardingDraft, kpi: e.target.value })
            }
          />
          <Field
            label="Goal description (optional)"
            value={onboardingDraft.description || ""}
            disabled={saving}
            onChange={(e) =>
              setOnboardingDraft({
                ...onboardingDraft,
                description: e.target.value,
              })
            }
          />
          <Field
            label="Goal owner (optional)"
            value={onboardingDraft.owner}
            disabled={saving}
            onChange={(e) =>
              setOnboardingDraft({ ...onboardingDraft, owner: e.target.value })
            }
          />
          <Field
            label="Goal deadline"
            type="date"
            value={onboardingDraft.deadline}
            disabled={saving}
            onChange={(e) =>
              setOnboardingDraft({
                ...onboardingDraft,
                deadline: e.target.value,
              })
            }
          />
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setOnboardingDraft(null)}
            >
              Cancel
            </Button>
            <Button busy={saving} onClick={() => void saveOnboarding()}>
              Save goal definition
            </Button>
          </div>
        </Modal>
      )}
      {draft && (
        <Modal
          title={draft.version ? "Edit governed goal" : "Create governed goal"}
          onClose={() => {
            if (!saving) setDraft(null);
          }}
        >
          <ErrorBox>{writeError}</ErrorBox>
          <Field
            label="Goal title"
            value={draft.title}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <Field
            label="Goal description (optional)"
            value={draft.description || ""}
            disabled={saving}
            onChange={(e) =>
              setDraft({ ...draft, description: e.target.value })
            }
          />
          {onboardingGoal && (
            <p>
              Original target: {onboardingGoal.target}
              {onboardingGoal.kpi
                ? ` · Measure as entered: ${onboardingGoal.kpi}`
                : ""}
              . Confirm the numeric target, direction, unit and period
              explicitly. The original definition is retained.
            </p>
          )}
          <label className="field">
            <span>Goal level</span>
            <select
              aria-label="Goal level"
              value={draft.level}
              disabled={saving}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  level: e.target.value as Draft["level"],
                  department:
                    e.target.value === "department"
                      ? metricOptions.find((v) => v.scope === draft.scope)
                          ?.department || ""
                      : "",
                })
              }
            >
              <option value="company">Company</option>
              <option value="department">Department</option>
            </select>
          </label>
          <label className="field">
            <span>Target metric and reporting scope</span>
            <select
              aria-label="Goal metric"
              value={draft.scope + "|" + draft.metricId}
              disabled={saving}
              onChange={(e) => {
                const [scope, metricId] = e.target.value.split("|");
                const metric = metricOptions.find(
                  (v) => v.scope === scope && v.metricId === metricId,
                );
                if (metric)
                  setDraft({
                    ...draft,
                    scope,
                    metricId,
                    unit: metric.unit as Draft["unit"],
                    currency: metric.currency,
                    department:
                      draft.level === "department"
                        ? metric.department || ""
                        : "",
                    period: metric.period || draft.period,
                  });
              }}
            >
              <option value="|">Choose metric</option>
              {metricOptions.map((v) => (
                <option
                  key={v.scope + v.metricId}
                  value={v.scope + "|" + v.metricId}
                >
                  {v.name} · {scopeName(v.scope)} · {v.state}
                </option>
              ))}
            </select>
          </label>
          {draft.level === "department" && (
            <p>
              Department:{" "}
              {draft.department || "Choose a metric assigned to a department."}
            </p>
          )}
          <Field label="Unit" value={draft.unit} disabled />
          {(draft.unit === "currency" || draft.currency !== null) && (
            <Field
              label={
                draft.unit === "currency"
                  ? "Goal currency"
                  : "Metric currency context"
              }
              value={draft.currency || ""}
              disabled={saving}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  currency: e.target.value.trim().toUpperCase(),
                })
              }
            />
          )}
          <Field
            label="Target value"
            type="number"
            step="any"
            value={draft.target}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, target: e.target.value })}
          />
          <label className="field">
            <span>Goal direction</span>
            <select
              aria-label="Goal direction"
              value={draft.direction}
              disabled={saving}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  direction: e.target.value as Draft["direction"],
                  baseline: e.target.value === "maintain" ? "" : draft.baseline,
                })
              }
            >
              <option value="increase">Increase to at least</option>
              <option value="decrease">Reduce to at most</option>
              <option value="maintain">Maintain a threshold</option>
            </select>
          </label>
          {draft.direction === "maintain" ? (
            <label className="field">
              <span>Threshold rule</span>
              <select
                aria-label="Threshold rule"
                value={draft.threshold}
                disabled={saving}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    threshold: e.target.value as Draft["threshold"],
                  })
                }
              >
                <option value="at_least">At least the target</option>
                <option value="at_most">At most the target</option>
              </select>
            </label>
          ) : (
            <Field
              label="Confirmed baseline (optional)"
              type="number"
              step="any"
              value={draft.baseline}
              disabled={saving}
              onChange={(e) => setDraft({ ...draft, baseline: e.target.value })}
            />
          )}
          <label className="field">
            <span>Reporting period type</span>
            <select
              aria-label="Goal period type"
              value={draft.period.kind}
              disabled={saving}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  period:
                    e.target.value === "snapshot"
                      ? { kind: "snapshot", asOf: "" }
                      : { kind: "interval", start: "", endExclusive: "" },
                })
              }
            >
              <option value="interval">Date interval</option>
              <option value="snapshot">Snapshot date</option>
            </select>
          </label>
          {draft.period.kind === "snapshot" ? (
            <Field
              label="Goal snapshot date"
              type="date"
              value={draft.period.asOf}
              disabled={saving}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  period: { kind: "snapshot", asOf: e.target.value },
                })
              }
            />
          ) : (
            <>
              <Field
                label="Goal reporting start"
                type="date"
                value={draft.period.start}
                disabled={saving}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    period: {
                      ...draft.period,
                      start: e.target.value,
                    } as SemanticPeriod,
                  })
                }
              />
              <Field
                label="Goal reporting end (exclusive)"
                type="date"
                value={draft.period.endExclusive}
                disabled={saving}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    period: {
                      ...draft.period,
                      endExclusive: e.target.value,
                    } as SemanticPeriod,
                  })
                }
              />
            </>
          )}
          <Field
            label="Goal deadline"
            type="date"
            value={draft.deadline}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, deadline: e.target.value })}
          />
          <Field
            label="Goal owner (optional)"
            value={draft.owner}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, owner: e.target.value })}
          />
          <label className="field">
            <span>Goal status</span>
            <select
              aria-label="Goal status"
              value={draft.lifecycle}
              disabled={saving}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  lifecycle: e.target.value as Draft["lifecycle"],
                })
              }
            >
              {["Active", "Paused", "Archived"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <p>
            Saving confirms the selected source and reporting period. A company
            goal uses this one governed reporting scope; unrelated worksheets
            are not combined. Owner is administrator-entered text, not an
            inferred identity. Threshold checks do not prove continuous
            adherence.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button
              busy={saving}
              disabled={
                !draft.title.trim() ||
                !draft.target.trim() ||
                !draft.metricId ||
                !draft.deadline ||
                (draft.level === "department" && !draft.department)
              }
              onClick={() =>
                save({
                  ...draft,
                  target: Number(draft.target),
                  baseline: draft.baseline.trim()
                    ? Number(draft.baseline)
                    : null,
                })
              }
            >
              Save goal
            </Button>
          </div>
        </Modal>
      )}
    </GovernedModule>
  );
}
