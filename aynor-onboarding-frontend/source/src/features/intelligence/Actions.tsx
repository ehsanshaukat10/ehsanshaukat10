import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Check } from "lucide-react";
import { Button, ErrorBox, Field, Modal } from "../../components/ui";
import { preferenceKey, type Risk } from "../dashboard/model";
import { useApp } from "../../lib/context";
import {
  AskLink,
  Blank,
  Evidence,
  ModulePage,
  Panel,
  Status,
  useExecutive,
  useLocalState,
  type ActionState,
  type ModuleProps,
} from "./shared";
const fingerprint = (
  r: { title: string; impact: string; evidence: string[] },
  period: string,
) => JSON.stringify([r.title, r.impact, r.evidence, period]);
export function Actions({ company }: ModuleProps) {
  const e = useExecutive(company),
    local = useLocalState(company),
    { user } = useApp(),
    location = useLocation(),
    id = location.pathname.split("/")[4],
    base = e.base + "/actions";
  const [reason, setReason] = useState(""),
    [dismiss, setDismiss] = useState(false),
    [note, setNote] = useState<string | null>(null),
    [pending, setPending] = useState<ActionState["status"] | null>(null);
  const known = (e.sample?.risks || []).map((r) => ({ ...r, source: true }));
  const items = [
    ...known,
    ...Object.entries(local.state.actions)
      .filter(
        ([key, a]) =>
          !known.some((r) => r.id === key) &&
          (e.editable ||
            company.data.departments.includes(a.snapshot.department)),
      )
      .map(
        ([id, a]) =>
          ({ id, ...a.snapshot, type: "delivery", source: false }) as Risk & {
            source: boolean;
          },
      ),
  ];
  const action = items.find((r) => r.id === id),
    decision = id ? local.state.actions[id] : undefined;
  const status = (key: string) =>
    local.state.actions[key]?.status || "Recommended";
  const oldNote = (title: string) => {
    try {
      return (
        JSON.parse(
          localStorage.getItem(
            preferenceKey(user?.id || "guest", company) + ".decisions",
          ) || "{}",
        )[title] || ""
      );
    } catch {
      return "";
    }
  };
  async function transition(next: ActionState["status"]) {
    if (!action) return;
    setPending(next);
    const entry: ActionState = {
      status: next,
      note: note ?? decision?.note ?? oldNote(action.title),
      reason: next === "Dismissed" ? reason : decision?.reason,
      at: new Date().toISOString(),
      fingerprint: fingerprint(action, e.period),
      snapshot: {
        title: action.title,
        impact: action.impact,
        department: action.department,
        severity: action.severity,
        action: action.action,
        evidence: action.evidence,
      },
    };
    if (
      await local.commit(
        {
          ...local.state,
          actions: { ...local.state.actions, [action.id]: entry },
        },
        next === "Completed"
          ? "Action marked complete."
          : next === "Dismissed"
            ? "Recommendation dismissed."
            : `Action ${next.toLowerCase()}.`,
      )
    ) {
      setPending(null);
      setDismiss(false);
    }
  }
  if (id)
    return (
      <ModulePage
        title={action?.title || "Action unavailable"}
        description={action?.department}
        exec={e}
        back={e.back || e.link(base)}
        actions={
          action && (
            <AskLink
              exec={e}
              context={`Action: ${action.title}. Recommendation: ${action.action}`}
              question="What alternatives should I consider?"
            />
          )
        }
      >
        {action ? (
          <>
            <div className="intel-action-state">
              <Status>{action.severity}</Status>
              <Status>{status(id)}</Status>
              <span>
                {decision
                  ? `User decision · ${new Date(decision.at).toLocaleString()}`
                  : "System recommendation · no decision recorded"}
              </span>
            </div>
            <ErrorBox>{local.error !== e.error ? local.error : ""}</ErrorBox>
            {local.error && pending && (
              <Button
                variant="secondary"
                busy={local.busy}
                onClick={() => transition(pending)}
              >
                Retry status update
              </Button>
            )}
            {(!action.source ||
              e.scenario === "stale" ||
              (decision &&
                decision.fingerprint !== fingerprint(action, e.period))) && (
              <div className="intel-notice warning">
                {!action.source
                  ? e.sample
                    ? "This recommendation is no longer flagged by current records. Your decision and historical evidence are retained."
                    : "Supporting source records are unavailable. The saved decision and historical evidence are retained."
                  : "Evidence has changed or become stale. Recheck it before acting; your previous decision has not been overwritten."}
                <Link to={e.link(e.base + "/connections", e.origin)}>
                  Review source <ArrowUpRight size={12} />
                </Link>
              </div>
            )}
            <div className="intel-two-column">
              <Panel title="What happened?">
                <p>{action.title}</p>
                <h3>Why it matters</h3>
                <p>{action.impact}</p>
                <Link
                  to={e.link(
                    e.base +
                      "/departments/" +
                      encodeURIComponent(action.department),
                    e.origin,
                  )}
                >
                  Investigate {action.department} <ArrowUpRight size={12} />
                </Link>
              </Panel>
              <Panel title="What Aynor recommends">
                <h3>{action.action}</h3>
                <p>
                  {action.type === "resource"
                    ? "Confirm available hours, sequence the two commitments, and agree a delivery owner."
                    : action.type === "receivables"
                      ? "Confirm the invoice owner and the next payment commitment before changing a cash-flow assumption."
                      : "Confirm the blocker, agree an owner and a follow-up date, then recheck supporting records."}
                </p>
                <small className="intel-muted">
                  Decision support only. No external task, payment or business
                  operation is executed.
                </small>
              </Panel>
            </div>
            <Panel title="What is the evidence?">
              <ul className="intel-evidence-list">
                {action.evidence.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <Evidence
                exec={e}
                lines={[
                  `Department: ${action.department}.`,
                  action.source
                    ? "Evidence is drawn from the current illustrative source."
                    : "Evidence is a retained historical snapshot; current support is unavailable.",
                ]}
              />
              <Link to={e.link(e.base + "/dependencies", e.origin)}>
                Explore related relationships <ArrowUpRight size={12} />
              </Link>
            </Panel>
            {e.editable ? (
              <Panel title="Your decision">
                <div className="intel-footer-actions">
                  {status(id) === "Recommended" && (
                    <Button
                      busy={local.busy}
                      onClick={() => transition("Accepted")}
                      disabled={!action.source}
                    >
                      Accept recommendation
                    </Button>
                  )}
                  {status(id) === "Accepted" && (
                    <Button
                      busy={local.busy}
                      onClick={() => transition("In Progress")}
                    >
                      Mark in progress
                    </Button>
                  )}
                  {status(id) === "In Progress" && (
                    <Button
                      busy={local.busy}
                      onClick={() => transition("Completed")}
                    >
                      <Check size={14} />
                      Mark completed
                    </Button>
                  )}
                  {["Completed", "Dismissed"].includes(status(id)) && (
                    <Button
                      variant="secondary"
                      busy={local.busy}
                      onClick={() => transition("Accepted")}
                    >
                      Reopen decision
                    </Button>
                  )}
                  {!["Dismissed", "Completed"].includes(status(id)) && (
                    <Button
                      variant="text"
                      disabled={local.busy}
                      onClick={() => setDismiss(true)}
                    >
                      Dismiss recommendation
                    </Button>
                  )}
                </div>
                <Field
                  label="Decision note"
                  disabled={local.busy}
                  placeholder="Owner, next step and review date"
                  value={note ?? decision?.note ?? oldNote(action.title)}
                  onChange={(v) => setNote(v.target.value)}
                />
                <Button
                  variant="secondary"
                  busy={local.busy}
                  onClick={() =>
                    transition(status(id) as ActionState["status"])
                  }
                >
                  Save decision note
                </Button>
                {decision?.reason && <p>Dismissal reason: {decision.reason}</p>}
              </Panel>
            ) : (
              <p className="intel-muted">
                Your role can investigate evidence. An Owner or Admin records
                decisions.
              </p>
            )}
            {dismiss && (
              <Modal
                title="Dismiss this recommendation?"
                onClose={() => setDismiss(false)}
              >
                <p>
                  The recommendation stays in the dismissed history. No external
                  operation will occur.
                </p>
                <Field
                  label="Reason (optional)"
                  value={reason}
                  onChange={(v) => setReason(v.target.value)}
                />
                <div className="modal-actions">
                  <Button variant="secondary" onClick={() => setDismiss(false)}>
                    Cancel
                  </Button>
                  <Button
                    busy={local.busy}
                    onClick={() => transition("Dismissed")}
                  >
                    Dismiss recommendation
                  </Button>
                </div>
              </Modal>
            )}
          </>
        ) : (
          <Blank
            title="No current or retained action"
            text="The recommendation may no longer be available or be outside your access."
            action={<Link to={e.link(base)}>Return to actions</Link>}
          />
        )}
      </ModulePage>
    );
  const filter = e.query.get("filter") || "Open",
    q = e.query.get("q") || "",
    department = e.query.get("department") || "All";
  const rows = items
    .filter(
      (r) =>
        (department === "All" || r.department === department) &&
        r.title.toLowerCase().includes(q.toLowerCase()) &&
        (filter === "All" ||
          (filter === "Open"
            ? !["Completed", "Dismissed"].includes(status(r.id))
            : status(r.id) === filter)),
    )
    .sort(
      (a, b) => Number(b.severity === "High") - Number(a.severity === "High"),
    );
  return (
    <ModulePage
      title="Actions"
      description="Turn evidence into a deliberate decision."
      exec={e}
    >
      <div className="intel-toolbar">
        <input
          aria-label="Search actions"
          placeholder="Find an issue"
          value={q}
          onChange={(v) => {
            const n = new URLSearchParams(e.query);
            n.set("q", v.target.value);
            e.setQuery(n);
          }}
        />
        <select
          aria-label="Action status"
          value={filter}
          onChange={(v) => {
            const n = new URLSearchParams(e.query);
            n.set("filter", v.target.value);
            e.setQuery(n);
          }}
        >
          {[
            "Open",
            "All",
            "Recommended",
            "Accepted",
            "In Progress",
            "Completed",
            "Dismissed",
          ].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select
          aria-label="Action department"
          value={department}
          onChange={(v) => {
            const n = new URLSearchParams(e.query);
            n.set("department", v.target.value);
            e.setQuery(n);
          }}
        >
          {["All", ...company.data.departments].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </div>
      <Panel title="Priorities & decisions">
        {rows.length ? (
          rows.map((r) => (
            <Link
              className="intel-row intel-action-row"
              key={r.id}
              to={e.link(base + "/" + r.id, e.origin)}
            >
              <Status>{r.severity}</Status>
              <span>
                {r.title}
                <small>{r.impact}</small>
                <em>{r.action}</em>
              </span>
              <span>
                <Status>{status(r.id)}</Status>
                <small>
                  {r.department}
                  {!r.source
                    ? e.sample
                      ? " · no longer flagged"
                      : " · source unavailable"
                    : ""}
                </small>
              </span>
              <ArrowUpRight size={14} />
            </Link>
          ))
        ) : (
          <Blank
            title={
              items.length
                ? "No actions in this view"
                : e.sample
                  ? "No open recommendations"
                  : "No evidence-backed actions yet"
            }
            text={
              items.length
                ? "Try a different status, department or search."
                : e.sample
                  ? "No supported issue is flagged in the available records."
                  : "Validate a source before assessing operational or financial risks."
            }
            action={
              items.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const n = new URLSearchParams(e.query);
                    n.delete("q");
                    n.delete("department");
                    n.set("filter", "All");
                    e.setQuery(n);
                  }}
                >
                  Show all decisions
                </Button>
              ) : (
                <Link
                  className="button secondary"
                  to={e.link(e.base + "/connections", e.origin)}
                >
                  Review source data
                </Link>
              )
            }
          />
        )}
      </Panel>
    </ModulePage>
  );
}
