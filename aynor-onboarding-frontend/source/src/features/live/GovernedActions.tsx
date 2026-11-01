import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, ErrorBox, Field, Modal } from "../../components/ui";
import { serverRequest } from "../../lib/runtime";
import type { Company } from "../../lib/api";
import { Panel, Blank, Status } from "../intelligence/shared";
import {
  GovernedModule,
  useGovernedModule,
  EvidenceLink,
} from "./GovernedModule";
import { intelligenceQuery } from "./intelligence-cache";
import { displayPeriod, type SemanticPeriod } from "./semantic-types";
type Action = {
  id: string;
  concernId?: string;
  origin: "system" | "user";
  title: string;
  department: string;
  scope: string;
  status: string;
  version: number;
  current: boolean;
  support: string;
  what?: string;
  why?: string;
  next?: string;
  note?: string;
  reason?: string;
  evidenceHref?: string | null;
  evidenceRevision?: string | null;
  evidenceChanged?: boolean;
  fact?: { period: SemanticPeriod; definition: string };
  updatedAt?: number;
};
type ActionView = {
  datasetRevision: string;
  authorization: { fingerprint: string };
  items: Action[];
};
type TaskDraft = {
  id: string;
  title: string;
  note: string;
  scope: string;
  department: string;
  status: string;
  version: number;
};
export function GovernedActions({ company }: { company: Company }) {
  const m = useGovernedModule(company),
    location = useLocation();
  let id = "";
  try {
    id = decodeURIComponent(location.pathname.split("/")[4] || "");
  } catch {}
  const root = m.base + "/intelligence/actions",
    list = m.base + "/actions";
  const [view, setView] = useState<{ key: string; items: Action[] } | null>(
      null,
    ),
    [loadError, setLoadError] = useState(""),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [draft, setDraft] = useState<TaskDraft | null>(null),
    [note, setNote] = useState<string | null>(null),
    [writeError, setWriteError] = useState(""),
    [busy, setBusy] = useState(false),
    [success, setSuccess] = useState("");
  useEffect(() => {
    setDraft(null);
    setNote(null);
    setWriteError("");
    setSuccess("");
  }, [company.id, id]);
  const key = m.report
    ? JSON.stringify([
        m.report.authorization.fingerprint,
        m.report.context.key,
        m.report.datasetRevision,
      ])
    : "";
  useEffect(() => {
    if (!m.report) return;
    let active = true;
    setLoading(true);
    setLoadError("");
    serverRequest<ActionView>(root + "?" + intelligenceQuery(location.search))
      .then((v) => {
        if (!active) return;
        if (
          v.authorization.fingerprint !== m.report!.authorization.fingerprint ||
          v.datasetRevision !== m.report!.datasetRevision
        ) {
          setView(null);
          m.retry();
          return;
        }
        setView({ key, items: v.items });
      })
      .catch((e) => {
        if (active) {
          setView(null);
          setLoadError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [m.report, refresh, root, location.search]);
  const items = view?.key === key ? view.items : [],
    action = items.find((x) => x.id === id || x.concernId === id);
  const admin = m.report?.authorization.canManageSources || false;
  async function saveTask() {
    if (!draft || busy) return;
    setBusy(true);
    setWriteError("");
    try {
      await serverRequest(root + "/tasks", "POST", draft);
      setDraft(null);
      setRefresh((v) => v + 1);
      setSuccess("Task saved. This is a user-created task.");
    } catch (e) {
      setWriteError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decision(status: string) {
    if (!action || busy) return;
    setBusy(true);
    setWriteError("");
    try {
      await serverRequest(root + "/decisions/" + action.id, "POST", {
        version: action.version,
        evidenceRevision: action.evidenceRevision,
        status,
        note: note ?? action.note ?? "",
        reason: "",
      });
      setRefresh((v) => v + 1);
      setSuccess(
        "Decision saved. Task completion does not establish that the source concern is resolved.",
      );
    } catch (e) {
      setWriteError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const status = m.query.get("status") || "Open",
    q = m.query.get("q") || "";
  const rows = items.filter(
    (x) =>
      x.title.toLowerCase().includes(q.toLowerCase()) &&
      (status === "All" ||
        (status === "Open"
          ? !["Completed", "Dismissed"].includes(x.status)
          : x.status === status)),
  );
  return (
    <GovernedModule
      title={id ? action?.title || "Action unavailable" : "Actions"}
      description={
        id
          ? action?.department
          : "Evidence-backed recommendations and your tasks."
      }
      module={m}
      back={id ? m.back || m.link(list) : undefined}
      actions={
        admin && !id ? (
          <Button
            onClick={() => {
              setWriteError("");
              setDraft({
                id: crypto.randomUUID(),
                title: "",
                note: "",
                scope: m.query.get("scope") || "",
                department: m.query.get("department") || "",
                status: "Accepted",
                version: 0,
              });
            }}
          >
            Create task
          </Button>
        ) : undefined
      }
    >
      {loadError && (
        <>
          <ErrorBox>{loadError}</ErrorBox>
          <Button variant="secondary" onClick={() => setRefresh((v) => v + 1)}>
            Retry actions
          </Button>
        </>
      )}
      {loading && (
        <p role="status">
          {items.length ? "Updating actions…" : "Loading authorized actions…"}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {id ? (
        action ? (
          <>
            <div className="intel-action-state">
              <Status>
                {action.origin === "system"
                  ? "System recommendation"
                  : "User-created task"}
              </Status>
              <Status>{action.status}</Status>
            </div>
            {!action.current && (
              <div className="intel-notice">
                Historical decision. Current evidence is unavailable, changed
                reporting period, or no longer flags this concern. The saved
                decision is retained; it is not a current recommendation.
              </div>
            )}
            {action.evidenceChanged && (
              <div className="intel-notice">
                Evidence changed since your recorded decision. Review the
                current evidence before taking another step.
              </div>
            )}
            {action.origin === "system" ? (
              <>
                <div className="intel-two-column">
                  <Panel title="What happened?">
                    <p>{action.what}</p>
                    <h3>Why it matters</h3>
                    <p>{action.why}</p>
                  </Panel>
                  <Panel title="What Aynor recommends">
                    <p>{action.next}</p>
                    <small>No external operation is executed.</small>
                  </Panel>
                </div>
                <Panel title="Supporting evidence">
                  <p>{action.fact?.definition}</p>
                  {action.fact?.period && (
                    <p>{displayPeriod(action.fact.period)}</p>
                  )}
                  {action.evidenceHref ? (
                    <EvidenceLink
                      companyId={company.id}
                      href={action.evidenceHref}
                      search={location.search}
                      origin={m.origin}
                    />
                  ) : (
                    <p>
                      The saved historical fact summary is retained. Current
                      source rows are not asserted as its evidence.
                    </p>
                  )}
                </Panel>
              </>
            ) : (
              <Panel title="Task details">
                <p>{action.note || "No task note recorded."}</p>
                <p>
                  User-created task. This is not a system finding or a validated
                  business metric.
                </p>
              </Panel>
            )}
            {admin ? (
              <Panel
                title={
                  action.origin === "system" ? "Your decision" : "Update task"
                }
              >
                <ErrorBox>{writeError}</ErrorBox>
                {action.origin === "system" && action.current && (
                  <Field
                    label="Decision note"
                    value={note ?? action.note ?? ""}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={busy}
                  />
                )}
                <div className="intel-footer-actions">
                  {action.origin === "system" && action.current ? (
                    <>
                      {[
                        "Accepted",
                        "In Progress",
                        "Completed",
                        "Dismissed",
                      ].map((s) => (
                        <Button
                          key={s}
                          variant="secondary"
                          busy={busy}
                          onClick={() => decision(s)}
                        >
                          {s === "Accepted"
                            ? "Accept recommendation"
                            : s === "In Progress"
                              ? "Mark in progress"
                              : s === "Completed"
                                ? "Mark completed"
                                : "Dismiss recommendation"}
                        </Button>
                      ))}
                      <Button
                        variant="text"
                        busy={busy}
                        onClick={() => decision(action.status)}
                      >
                        Save decision note
                      </Button>
                    </>
                  ) : action.origin === "user" ? (
                    <Button
                      onClick={() => {
                        setWriteError("");
                        setDraft({
                          id: action.id,
                          title: action.title,
                          note: action.note ?? "",
                          scope: action.scope,
                          department: action.department,
                          status: action.status,
                          version: action.version,
                        });
                      }}
                    >
                      Edit task
                    </Button>
                  ) : (
                    <p>
                      Historical decisions are retained read-only until current
                      validated evidence supports the recommendation.
                    </p>
                  )}
                </div>
              </Panel>
            ) : (
              <p>
                Your role can investigate evidence. An Owner or Admin records
                tasks and decisions.
              </p>
            )}
          </>
        ) : !loading && !loadError ? (
          <Blank
            title="Action unavailable"
            text="This action is unavailable or outside your current access."
          />
        ) : null
      ) : (
        <>
          <div className="intel-toolbar">
            <input
              aria-label="Search actions"
              placeholder="Find an action"
              value={q}
              onChange={(e) => m.change("q", e.target.value)}
            />
            <select
              aria-label="Action status"
              value={status}
              onChange={(e) => m.change("status", e.target.value)}
            >
              {[
                "Open",
                "All",
                "Recommended",
                "Accepted",
                "In Progress",
                "Completed",
                "Dismissed",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <Panel title="Priorities & decisions">
            {rows.map((a) => (
              <Link
                className="intel-row intel-action-row"
                key={a.id}
                to={m.link(list + "/" + a.id, m.origin)}
              >
                <Status>{a.status}</Status>
                <span>
                  {a.title}
                  <small>
                    {a.origin === "system"
                      ? "System recommendation"
                      : "User-created task"}
                    {a.department ? ` · ${a.department}` : ""}
                    {!a.current ? " · historical" : ""}
                  </small>
                  <em>{a.origin === "system" ? a.what : a.note}</em>
                </span>
              </Link>
            ))}
            {!rows.length && !loading && !loadError && (
              <Blank
                title={
                  items.length
                    ? "No actions in this view"
                    : "No evidence-backed recommendations or tasks"
                }
                text={
                  items.length
                    ? "Adjust the action status or search."
                    : "No supported concern is currently available in this authorized scope. Missing or unvalidated data is not proof that no issues exist."
                }
              />
            )}
          </Panel>
        </>
      )}
      {draft && (
        <Modal
          title={draft.version ? "Edit user task" : "Create user task"}
          onClose={() => {
            if (!busy) setDraft(null);
          }}
        >
          <ErrorBox>{writeError}</ErrorBox>
          <Field
            label="Task title"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            disabled={busy}
          />
          <Field
            label="Task note"
            value={draft.note}
            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            disabled={busy}
          />
          <label className="field">
            <span>Task reporting scope</span>
            <select
              aria-label="Task reporting scope"
              disabled={busy}
              value={draft.scope}
              onChange={(e) => {
                const scope = m.report?.scopes.find(
                  (s) => s.id === e.target.value,
                );
                setDraft({
                  ...draft,
                  scope: e.target.value,
                  department: scope?.department || "",
                });
              }}
            >
              <option value="">No source link · administrator-only task</option>
              {m.report?.scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} · {s.department || "Unassigned"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Task status</span>
            <select
              aria-label="Task status"
              disabled={busy}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {["Accepted", "In Progress", "Completed", "Dismissed"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <p>
            User-created tasks are not automatically validated recommendations.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button
              busy={busy}
              disabled={!draft.title.trim()}
              onClick={saveTask}
            >
              Save task
            </Button>
          </div>
        </Modal>
      )}
    </GovernedModule>
  );
}
