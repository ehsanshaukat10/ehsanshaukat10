import {
  ArrowLeft,
  ArrowRight,
  Mail,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "../../components/AppHeader";
import { Badge, Button, ErrorBox, Modal, Select } from "../../components/ui";
import { api, type Company } from "../../lib/api";
import { useApp } from "../../lib/context";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";

export function TeamInvites({
  company,
  compact = false,
  onComplete,
  onDraftChange,
  onBusyChange,
  onInvited,
}: {
  company: Company;
  compact?: boolean;
  onComplete?: () => void;
  onDraftChange?: (hasDraft: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onInvited?: (count: number) => void;
}) {
  const [rows, setRows] = useState([
      {
        email: "",
        role: compact ? "Executive" : "Viewer",
        scope: [] as string[],
      },
    ]),
    [invites, setInvites] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [links, setLinks] = useState<{ email: string; link: string }[]>([]);
  const { toast } = useApp();
  useEffect(() => {
    onDraftChange?.(rows.some((r) => r.email.trim().length > 0));
  }, [rows, onDraftChange]);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  async function load() {
    try {
      setInvites(await api(`/companies/${company.id}/invitations`));
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, [company.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const failures: string[] = [];
    const successes: { email: string; link: string }[] = [];
    const failedRows: typeof rows = [];
    for (const row of rows) {
      try {
        const r = await api(
          `/companies/${company.id}/invitations`,
          "POST",
          row,
        );
        successes.push({ email: row.email, link: r.developmentLink });
      } catch (e) {
        failures.push(`${row.email}: ${message(e)}`);
        failedRows.push(row);
      }
    }
    setLinks((l) => [...l, ...successes]);
    if (successes.length) onInvited?.(successes.length);
    if (successes.length)
      toast(
        `${successes.length} sample invitation${successes.length > 1 ? "s" : ""} created. No email was sent.`,
      );
    setError(failures.join(" "));
    setRows(
      failedRows.length
        ? failedRows
        : [{ email: "", role: "Viewer", scope: [] }],
    );
    await load();
    setBusy(false);
    if (!failures.length && successes.length) onComplete?.();
  }
  return (
    <>
      {!compact && (
        <div className="quiet-note">
          <ShieldCheck size={17} />
          <span>
            Give people the access they need. Ownership is never granted through
            ordinary invitations.
          </span>
        </div>
      )}
      <ErrorBox>{error}</ErrorBox>
      <form id={compact ? "wizard-invitations" : undefined} onSubmit={submit}>
        <div className="invite-form-head">
          <span>EMAIL ADDRESS</span>
          <span>ROLE</span>
        </div>
        {rows.map((row, i) => (
          <div className="invite-form-row" key={i}>
            <div>
              <input
                type="email"
                required
                placeholder="colleague@company.com"
                aria-label={`Invitation email ${i + 1}`}
                value={row.email}
                onChange={(e) =>
                  setRows((r) =>
                    r.map((x, j) =>
                      i === j ? { ...x, email: e.target.value } : x,
                    ),
                  )
                }
              />
              {["Department Manager", "Viewer"].includes(row.role) && (
                <div className="scope-options">
                  {company.data.departments.map((d) => (
                    <label key={d}>
                      <input
                        type="checkbox"
                        checked={row.scope.includes(d)}
                        onChange={() =>
                          setRows((r) =>
                            r.map((x, j) =>
                              i === j
                                ? {
                                    ...x,
                                    scope: x.scope.includes(d)
                                      ? x.scope.filter((s) => s !== d)
                                      : [...x.scope, d],
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      {d}
                    </label>
                  ))}
                  {!company.data.departments.length && (
                    <small>Add departments before inviting scoped roles.</small>
                  )}
                </div>
              )}
            </div>
            <select
              aria-label={`Invitation role ${i + 1}`}
              value={row.role}
              onChange={(e) =>
                setRows((r) =>
                  r.map((x, j) =>
                    i === j ? { ...x, role: e.target.value } : x,
                  ),
                )
              }
            >
              {["Admin", "Executive", "Department Manager", "Viewer"]
                .filter((r) => company.role === "Owner" || r !== "Admin")
                .map((r) => (
                  <option key={r}>{r}</option>
                ))}
            </select>
            <button
              className="icon-button"
              type="button"
              aria-label={`Remove invitation row ${i + 1}`}
              disabled={rows.length === 1}
              onClick={() => setRows((r) => r.filter((_, j) => i !== j))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <div className="invite-actions">
          <Button
            type="button"
            variant="text"
            onClick={() =>
              setRows((r) => [...r, { email: "", role: "Viewer", scope: [] }])
            }
          >
            <Plus size={15} /> Add another person
          </Button>
          {!compact && (
            <Button type="submit" busy={busy}>
              <Mail size={15} /> Send invitations
            </Button>
          )}
        </div>
      </form>
      {!compact && (
        <div className="role-explainer">
          <h4>Thoughtful access. Better collaboration.</h4>
          <div>
            <p>
              <strong>Admin</strong>Company configuration and team
              administration.
            </p>
            <p>
              <strong>Executive</strong>Company overview. Restricted data stays
              private.
            </p>
            <p>
              <strong>Department Manager</strong>Assigned departments and
              permitted insights.
            </p>
            <p>
              <strong>Viewer</strong>Read-only access to explicitly permitted
              departments.
            </p>
          </div>
        </div>
      )}
      {!compact && links.length > 0 && (
        <div className="development-links">
          <Badge>SIMULATED EMAIL DELIVERY · NO EMAIL SENT</Badge>
          {links.map((l, i) => (
            <div key={i}>
              <strong>{l.email}</strong>
              <input
                readOnly
                aria-label={`Invitation link for ${l.email}`}
                value={location.origin + l.link}
              />
              <Button
                variant="text"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      location.origin + l.link,
                    );
                    toast("Sample invitation link copied.");
                  } catch {
                    toast("Select and copy the link from the field.");
                  }
                }}
              >
                Copy link
              </Button>
            </div>
          ))}
        </div>
      )}
      {invites.length > 0 && (
        <section className="pending-invites">
          <h3>
            Workspace invitations{" "}
            <span className="subtle">({invites.length})</span>
          </h3>
          {invites.map((i) => (
            <div className="invitation-line" key={i.id}>
              <span className="avatar">
                <Mail size={15} />
              </span>
              <div>
                <strong>{i.email}</strong>
                <small>
                  {i.role} · {JSON.parse(i.scope).join(", ") || "Company scope"}
                </small>
              </div>
              <Badge tone={i.status === "accepted" ? "success" : ""}>
                {i.status === "pending" && i.expires < Date.now()
                  ? "expired"
                  : i.status}
              </Badge>
              {i.status === "pending" && (
                <Button
                  variant="text"
                  onClick={async () => {
                    try {
                      const r = await api(
                        `/companies/${company.id}/invitations/${i.id}`,
                        "POST",
                        {},
                      );
                      setLinks((l) => [
                        ...l,
                        { email: i.email, link: r.developmentLink },
                      ]);
                      load();
                      toast(
                        "Sample invitation refreshed. Previous link is invalid. No email was sent.",
                      );
                    } catch (e) {
                      setError(message(e));
                    }
                  }}
                >
                  Resend
                </Button>
              )}
              {i.status === "pending" && (
                <Button
                  variant="text"
                  onClick={async () => {
                    try {
                      await api(
                        `/companies/${company.id}/invitations/${i.id}`,
                        "DELETE",
                      );
                      load();
                      toast("Invitation revoked.");
                    } catch (e) {
                      setError(message(e));
                    }
                  }}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

export function Invitation() {
  const { token } = useParams(),
    nav = useNavigate();
  const [invite, setInvite] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/invitations/${token}`)
      .then(setInvite)
      .catch((e) => setError(message(e)));
  }, [token]);
  async function respond(action: string) {
    setBusy(true);
    try {
      const r = await api(`/invitations/${token}/${action}`, "POST");
      nav(
        action === "accept"
          ? `/companies/${r.companyId}/overview`
          : "/companies",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="invitation-landing">
        <span className="empty-icon">
          <Mail size={27} />
        </span>
        <div className="page-kicker">BETTER DECISIONS, TOGETHER</div>
        <h1>You’re invited.</h1>
        <p>A new perspective starts with the right people.</p>
        <ErrorBox>{error}</ErrorBox>
        {invite && (
          <div className="invitation-detail">
            <span className="company-initial">
              {invite.company.slice(0, 2).toUpperCase()}
            </span>
            <h2>{invite.company}</h2>
            <p>{invite.inviter} invited you to join as</p>
            <Badge>{invite.role}</Badge>
            {invite.scope.length > 0 && (
              <p>Departments: {invite.scope.join(", ")}</p>
            )}
            <div className="modal-actions">
              <Button
                variant="secondary"
                busy={busy}
                onClick={() => respond("decline")}
              >
                Decline
              </Button>
              <Button busy={busy} onClick={() => respond("accept")}>
                Accept invitation <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        )}
        <Link className="back-link" to="/companies">
          <ArrowLeft size={15} /> Your companies
        </Link>
      </main>
    </div>
  );
}

export function Members({ company }: { company: Company }) {
  const [members, setMembers] = useState<any[]>([]),
    [error, setError] = useState(""),
    [target, setTarget] = useState<any>(null),
    [role, setRole] = useState("Viewer"),
    [scope, setScope] = useState<string[]>([]),
    [remove, setRemove] = useState(false);
  const { toast } = useApp();
  async function load() {
    try {
      setMembers(await api(`/companies/${company.id}/members`));
    } catch (e) {
      setError(message(e));
    }
  }
  useEffect(() => {
    load();
  }, [company.id]);
  return (
    <>
      <div className="page-kicker">YOUR PEOPLE, CONNECTED</div>
      <div className="page-title-row">
        <div>
          <h1>
            The right people.
            <br />
            <span className="accent">The right perspective.</span>
          </h1>
          <p>Manage who can access {company.name}.</p>
        </div>
        <Badge>{company.role}</Badge>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <section className="members-list">
        <div className="section-line">
          <h3>Workspace members</h3>
          <span className="subtle">{members.length} members</span>
        </div>
        {members.map((m) => (
          <div className="member-row" key={m.id}>
            <span className="avatar">{m.name.charAt(0)}</span>
            <div>
              <strong>{m.name}</strong>
              <small>
                {m.email}
                {m.scope.length > 0 ? " · " + m.scope.join(", ") : ""}
              </small>
            </div>
            <Badge>{m.role}</Badge>
            {company.role === "Owner" && m.role !== "Owner" && (
              <Button
                variant="text"
                onClick={() => {
                  setTarget(m);
                  setRole(m.role);
                  setScope(m.scope);
                  setRemove(false);
                }}
              >
                Manage
              </Button>
            )}
          </div>
        ))}
      </section>
      <div className="team-invite-heading">
        <h2>Make room for better collaboration.</h2>
        <p>Invite your team with company-specific roles and permissions.</p>
      </div>
      <TeamInvites company={company} />
      {target && (
        <Modal title={`Manage ${target.name}`} onClose={() => setTarget(null)}>
          <Select
            label="Role"
            value={role}
            options={["Admin", "Executive", "Department Manager", "Viewer"]}
            onChange={setRole}
          />
          <div className="scope-options">
            {company.data.departments.map((d) => (
              <label key={d}>
                <input
                  type="checkbox"
                  checked={scope.includes(d)}
                  onChange={() =>
                    setScope(
                      scope.includes(d)
                        ? scope.filter((x) => x !== d)
                        : [...scope, d],
                    )
                  }
                />
                {d}
              </label>
            ))}
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={remove}
              onChange={(e) => setRemove(e.target.checked)}
            />{" "}
            Remove this member from the company
          </label>
          <Button
            variant={remove ? "danger" : ""}
            onClick={async () => {
              try {
                await api(
                  `/companies/${company.id}/members/${target.id}`,
                  remove ? "DELETE" : "PATCH",
                  { role, scope },
                );
                setTarget(null);
                load();
                toast("Membership updated.");
              } catch (e) {
                setError(message(e));
                setTarget(null);
              }
            }}
          >
            {remove ? "Confirm removal" : "Save permissions"}
          </Button>
        </Modal>
      )}
    </>
  );
}
