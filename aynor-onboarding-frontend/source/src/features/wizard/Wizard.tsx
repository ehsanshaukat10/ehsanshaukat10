import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  FileSpreadsheet,
  Plus,
  Settings2,
  ShieldCheck,
  Target,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  ErrorBox,
  Field,
  Logo,
  Modal,
  Select,
  Tick,
} from "../../components/ui";
import {
  api,
  departmentOptions,
  sampleSources,
  type Company,
  type WorkspaceData,
} from "../../lib/api";
import { TeamInvites } from "../team/Team";
import {
  resumeStep,
  wizardNames,
  wizardSteps,
  type WizardStep,
} from "./progress";

const emptyProfile = {
  name: "",
  industry: "",
  country: "Pakistan",
  timezone: "Asia/Karachi",
  currency: "PKR",
  website: "",
  size: "",
};
export function Wizard() {
  const { id, step: raw = "company" } = useParams();
  const nav = useNavigate();
  const step = (
    wizardSteps.includes(raw as WizardStep)
      ? raw
      : raw === "departments"
        ? "structure"
        : ["invite", "kpis", "goals"].includes(raw)
          ? "team"
          : ["review", "complete"].includes(raw)
            ? "finish"
            : raw === "company"
              ? "company"
              : "connect"
  ) as WizardStep;
  const [company, setCompany] = useState<Company | null>(null),
    [data, setData] = useState<WorkspaceData | null>(null),
    [profile, setProfile] = useState<typeof emptyProfile>(() => {
      try {
        return (
          JSON.parse(
            sessionStorage.getItem(
              id ? `aynor.profile-draft.${id}` : "aynor.company-draft",
            ) || "null",
          ) || emptyProfile
        );
      } catch {
        return emptyProfile;
      }
    }),
    [loading, setLoading] = useState(!!id),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [custom, setCustom] = useState(""),
    [details, setDetails] = useState(false),
    [consent, setConsent] = useState(false),
    [selectedReview, setSelectedReview] = useState(false),
    [hasDraft, setHasDraft] = useState(false),
    [teamSent, setTeamSent] = useState(false),
    [invitationBusy, setInvitationBusy] = useState(false),
    [pending, setPending] = useState<number | null>(null);
  const creationKey = useRef(
    sessionStorage.getItem("aynor.company-create-key") || crypto.randomUUID(),
  );
  const savedDraft = useRef("");
  const index = wizardSteps.indexOf(step);
  async function load() {
    setError("");
    if (!id) {
      const pending = sessionStorage.getItem("aynor.pending-company");
      if (pending) {
        nav(`/companies/${pending}/onboarding/company`, { replace: true });
        return;
      }
      setLoading(false);
      const draft = sessionStorage.getItem("aynor.company-draft");
      if (draft)
        try {
          setProfile(JSON.parse(draft));
        } catch {}
      return;
    }
    setLoading(true);
    try {
      const c = await api<Company>(`/companies/${id}`);
      setCompany(c);
      const draft = sessionStorage.getItem(`aynor.wizard-draft.${id}`);
      let d = c.data;
      if (draft)
        try {
          const parsed = JSON.parse(draft);
          if (parsed.version === c.version) d = parsed.data;
          else sessionStorage.removeItem(`aynor.wizard-draft.${id}`);
        } catch {}
      setData(d);
      const profileDraft = sessionStorage.getItem(
        `aynor.profile-draft.${c.id}`,
      );
      setProfile(
        profileDraft
          ? JSON.parse(profileDraft)
          : {
              name: c.name,
              industry: c.industry,
              country: c.country,
              currency: c.currency,
              timezone: c.timezone,
              website: c.website,
              size: c.size,
            },
      );
      savedDraft.current = JSON.stringify(c.data);
      try {
        const invites = await api<any[]>(`/companies/${id}/invitations`);
        setPending(
          invites.filter(
            (i) => i.status === "pending" && i.expires > Date.now(),
          ).length,
        );
      } catch {
        setPending(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    if (!id) {
      sessionStorage.setItem("aynor.company-draft", JSON.stringify(profile));
      sessionStorage.setItem("aynor.company-create-key", creationKey.current);
    }
  }, [profile, id]);
  useEffect(() => {
    if (company)
      sessionStorage.setItem(
        `aynor.profile-draft.${company.id}`,
        JSON.stringify(profile),
      );
  }, [profile, company]);
  useEffect(() => {
    if (data && company)
      sessionStorage.setItem(
        `aynor.wizard-draft.${company.id}`,
        JSON.stringify({ version: company.version, data }),
      );
  }, [data, company]);
  useEffect(() => {
    setError("");
    setSelectedReview(false);
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => {
    if (step === "finish" && id)
      api<any[]>(`/companies/${id}/invitations`)
        .then((i) =>
          setPending(
            i.filter((x) => x.status === "pending" && x.expires > Date.now())
              .length,
          ),
        )
        .catch(() => setPending(null));
  }, [step, id]);
  const progress = data?.wizard || {
    current: company ? resumeStep(company) : "company",
    steps: company ? { company: "completed" as const } : {},
  };
  const allowed = (i: number) =>
    i === 0 ||
    wizardSteps
      .slice(0, i)
      .every(
        (s) =>
          ["completed", "skipped"].includes(progress.steps[s] || "") ||
          (s === "company" && !!company) ||
          (s === "structure" && !!data?.steps.departments) ||
          (s === "connect" && !!data?.connected),
      );
  const earliest = wizardSteps.findIndex((_, i) => !allowed(i));
  if (id && raw !== step)
    return <Navigate to={`/companies/${id}/onboarding/${step}`} replace />;
  if (company && !["Owner", "Admin"].includes(company.role))
    return <Navigate to={`/companies/${id}/overview`} replace />;
  if (company && !loading && !allowed(index))
    return (
      <Navigate
        to={`/companies/${id}/onboarding/${wizardSteps[Math.max(0, earliest - 1)]}`}
        replace
      />
    );
  const update = (key: keyof WorkspaceData, value: unknown) =>
    setData((d) => {
      if (!d) return d;
      const next = { ...d, [key]: value };
      if (company)
        sessionStorage.setItem(
          `aynor.wizard-draft.${company.id}`,
          JSON.stringify({ version: company.version, data: next }),
        );
      return next;
    });
  const field = (key: keyof typeof profile, value: string) =>
    setProfile((p) => {
      const next = { ...p, [key]: value };
      sessionStorage.setItem(
        company ? `aynor.profile-draft.${company.id}` : "aynor.company-draft",
        JSON.stringify(next),
      );
      return next;
    });
  async function persist(d: WorkspaceData) {
    if (!company) return false;
    try {
      const c = await api<Company>(`/companies/${company.id}`, "PATCH", {
        version: company.version,
        data: d,
      });
      setCompany(c);
      setData(c.data);
      savedDraft.current = JSON.stringify(c.data);
      sessionStorage.removeItem(`aynor.wizard-draft.${company.id}`);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  async function advance(skip = false) {
    if (busy || !data || !company) return;
    setBusy(true);
    setError("");
    try {
      if (
        step === "connect" &&
        !skip &&
        (!data.connected || !data.sources.length)
      )
        throw Error("Select a spreadsheet, or skip data connection for now.");
      const next = wizardSteps[Math.min(index + 1, 4)];
      const d = {
        ...data,
        wizard: {
          current: next,
          steps: {
            ...progress.steps,
            [step]: skip ? ("skipped" as const) : ("completed" as const),
          },
        },
        step: next,
        ...(step === "finish" ? { completed: true } : {}),
      };
      if (await persist(d)) {
        if (step === "finish") nav(`/companies/${company.id}/overview`);
        else nav(`/companies/${company.id}/onboarding/${next}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createOrUpdate(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let c = company;
      if (
        !profile.name.trim() ||
        !profile.industry ||
        !profile.country ||
        !profile.currency ||
        !profile.timezone
      )
        throw Error("Complete the required company details.");
      if (!c) {
        c = await api<Company>("/companies", "POST", profile, {
          "Idempotency-Key": creationKey.current,
        });
        setCompany(c);
        sessionStorage.setItem("aynor.pending-company", c.id);
      } else {
        c = await api<Company>(`/companies/${c.id}/profile`, "PATCH", {
          ...profile,
          version: c.version,
        });
        setCompany(c);
      }
      const d = {
        ...c.data,
        wizard: {
          current: "structure" as WizardStep,
          steps: { ...c.data.wizard?.steps, company: "completed" as const },
        },
        step: "structure",
      };
      const updated = await api<Company>(`/companies/${c.id}`, "PATCH", {
        version: c.version,
        data: d,
      });
      setCompany(updated);
      setData(updated.data);
      sessionStorage.removeItem("aynor.company-draft");
      sessionStorage.removeItem("aynor.company-create-key");
      sessionStorage.removeItem("aynor.pending-company");
      nav(`/companies/${c.id}/onboarding/structure`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function back() {
    if (busy) return;
    if (!company) {
      nav("/onboarding/welcome");
      return;
    }
    if (index === 0) {
      nav("/companies");
      return;
    }
    setBusy(true);
    if (
      data &&
      (await persist({
        ...data,
        wizard: { ...progress, current: wizardSteps[Math.max(index - 1, 0)] },
      }))
    )
      nav(`/companies/${id}/onboarding/${wizardSteps[Math.max(index - 1, 0)]}`);
    setBusy(false);
  }
  async function visit(i: number) {
    if (i === index || !allowed(i) || busy) return;
    if (!company) return;
    setBusy(true);
    if (
      data &&
      (await persist({
        ...data,
        wizard: { ...progress, current: wizardSteps[i] },
      }))
    )
      nav(`/companies/${id}/onboarding/${wizardSteps[i]}`);
    setBusy(false);
  }
  const headings = [
    "Let’s build your workspace.",
    "How does your company work?",
    "Connect the dots.",
    "Better decisions, together.",
    "Everything in its place.",
  ];
  return (
    <div className="wizard-shell">
      <header className="wizard-header">
        <Logo />
        <span>{company?.name || "YOUR NEW WORKSPACE"}</span>
        <span className="wizard-prototype">Interactive prototype</span>
      </header>
      <nav className="wizard-progress" aria-label="Onboarding progress">
        {wizardSteps.map((s, i) => (
          <button
            key={s}
            aria-current={i === index ? "step" : undefined}
            disabled={!allowed(i) || busy || (!company && i !== 0)}
            onClick={() => visit(i)}
            className={
              (i === index ? "current " : "") +
              (progress.steps[s] === "completed" ? "done" : "")
            }
          >
            <span>
              {progress.steps[s] === "completed" ? <Check size={12} /> : i + 1}
            </span>
            <strong>{wizardNames[i]}</strong>
            {progress.steps[s] === "skipped" && <small>Skipped</small>}
          </button>
        ))}
      </nav>
      {loading ? (
        <div className="boot wizard-loading">
          <span className="loading-line" />
          Loading your setup…
        </div>
      ) : id && !company ? (
        <main className="wizard-content">
          <ErrorBox>{error}</ErrorBox>
          <Button onClick={load}>Retry</Button>
          <Link to="/companies">Your companies</Link>
        </main>
      ) : (
        <main className={"wizard-content wizard-" + step}>
          <div className="wizard-title">
            <div className="page-kicker">
              STEP {index + 1} OF 5 · {wizardNames[index].toUpperCase()}
            </div>
            <h1>{headings[index]}</h1>
            <p>
              {
                [
                  "Just the essentials. Everything else can wait.",
                  "Choose the departments you need.",
                  "Choose the spreadsheets you want to bring into Aynor.",
                  "Invite your people, with the access they need.",
                  "A quick check, then you’re in.",
                ][index]
              }
            </p>
          </div>
          <ErrorBox>{error}</ErrorBox>
          {step === "company" && (
            <form id="wizard-company" onSubmit={createOrUpdate}>
              <Field
                label="Company name"
                required
                maxLength={120}
                autoComplete="organization"
                placeholder="e.g. Vordx Technologies"
                value={profile.name}
                onChange={(e) => field("name", e.target.value)}
              />
              <Select
                label="Industry"
                required
                value={profile.industry}
                onChange={(v) => field("industry", v)}
                options={[
                  "Technology & software",
                  "Professional services",
                  "Finance & banking",
                  "Retail & commerce",
                  "Manufacturing",
                  "Healthcare",
                  "Education",
                  "Other",
                ]}
              />
              <Select
                label="Country"
                required
                value={profile.country}
                options={[
                  "Pakistan",
                  "United States",
                  "United Kingdom",
                  "United Arab Emirates",
                  "India",
                  "Canada",
                  "Australia",
                  "Germany",
                  "Singapore",
                  "Other",
                ]}
                onChange={(v) => {
                  field("country", v);
                  const map: Record<string, string[]> = {
                    Pakistan: ["Asia/Karachi", "PKR"],
                    "United States": ["America/New_York", "USD"],
                    "United Kingdom": ["Europe/London", "GBP"],
                    "United Arab Emirates": ["Asia/Dubai", "AED"],
                    India: ["Asia/Kolkata", "INR"],
                    Canada: ["America/Toronto", "CAD"],
                    Australia: ["Australia/Sydney", "AUD"],
                    Germany: ["Europe/Berlin", "EUR"],
                    Singapore: ["Asia/Singapore", "SGD"],
                  };
                  if (map[v]) {
                    field("timezone", map[v][0]);
                    field("currency", map[v][1]);
                  }
                }}
              />
              <details
                className="wizard-disclosure"
                open={details}
                onToggle={(e) => setDetails(e.currentTarget.open)}
              >
                <summary>
                  Preferences{" "}
                  <span>
                    {profile.currency} · {profile.timezone}
                  </span>
                  <ChevronDown size={14} />
                </summary>
                <div className="form-grid">
                  <Select
                    label="Currency"
                    required
                    value={profile.currency}
                    onChange={(v) => field("currency", v)}
                    options={[
                      "PKR",
                      "USD",
                      "GBP",
                      "AED",
                      "INR",
                      "EUR",
                      "CAD",
                      "AUD",
                      "SGD",
                    ]}
                  />
                  <Select
                    label="Time zone"
                    required
                    value={profile.timezone}
                    onChange={(v) => field("timezone", v)}
                    options={[
                      "Asia/Karachi",
                      "America/New_York",
                      "America/Los_Angeles",
                      "Europe/London",
                      "Asia/Dubai",
                      "Asia/Kolkata",
                      "America/Toronto",
                      "Australia/Sydney",
                      "Europe/Berlin",
                      "Asia/Singapore",
                      "UTC",
                    ]}
                  />
                </div>
              </details>
            </form>
          )}
          {step === "structure" && data && (
            <>
              <div className="department-grid">
                {[...new Set([...departmentOptions, ...data.departments])].map(
                  (d, i) => (
                    <button
                      key={d}
                      aria-pressed={data.departments.includes(d)}
                      className={
                        "department-tile " +
                        (data.departments.includes(d) ? "selected" : "")
                      }
                      onClick={() => {
                        if (
                          data.mappings.some(
                            (m) => m.department === d && !m.ignored,
                          )
                        ) {
                          setError(
                            "This department has mapped fields. Review its mappings in workspace settings before removing it.",
                          );
                          return;
                        }
                        update(
                          "departments",
                          data.departments.includes(d)
                            ? data.departments.filter((x) => x !== d)
                            : [...data.departments, d],
                        );
                      }}
                    >
                      <span className="department-icon">
                        <DepartmentIcon index={i} />
                      </span>
                      <Tick selected={data.departments.includes(d)} />
                      <strong>{d}</strong>
                    </button>
                  ),
                )}
              </div>
              <form
                className="custom-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    !custom.trim() ||
                    data.departments.some(
                      (d) => d.toLowerCase() === custom.trim().toLowerCase(),
                    )
                  ) {
                    setError("Enter a unique department name.");
                    return;
                  }
                  update("departments", [...data.departments, custom.trim()]);
                  setCustom("");
                  setError("");
                }}
              >
                <Plus size={16} />
                <input
                  aria-label="Custom department"
                  value={custom}
                  maxLength={80}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="Add a department"
                />
                <Button variant="text" type="submit">
                  Add
                </Button>
              </form>
            </>
          )}
          {step === "connect" && data && (
            <>
              <section className="wizard-connection">
                <span className="sheets-logo">
                  <FileSpreadsheet size={28} />
                </span>
                <div>
                  <h3>Google Sheets</h3>
                  <p>
                    {data.connected
                      ? "Sample account connected"
                      : "Read-only access to the spreadsheets you choose."}
                  </p>
                </div>
                {data.connected ? (
                  <Badge tone="success">Connected · sample</Badge>
                ) : null}
              </section>
              {!data.connected ? (
                <div className="wizard-connection-note">
                  Sample connection only. No real Google account is accessed.
                </div>
              ) : (
                <>
                  <div className="wizard-source-list">
                    {sampleSources.map((s) => (
                      <label key={s} className="wizard-source-row">
                        <input
                          type="checkbox"
                          checked={data.sources.includes(s)}
                          onChange={() => {
                            update(
                              "sources",
                              data.sources.includes(s)
                                ? data.sources.filter((x) => x !== s)
                                : [...data.sources, s],
                            );
                            update("mappings", []);
                            update("discovered", false);
                            update("kpis", []);
                          }}
                        />
                        <FileSpreadsheet size={18} />
                        <span>
                          {s}
                          <small>Sample workbook</small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {data.mappings.some((m) => !m.confirmed && !m.ignored) && (
                    <details className="wizard-disclosure">
                      <summary>
                        Review selected data <ChevronDown size={14} />
                      </summary>
                      <p>
                        {data.sources.length} sample workbook
                        {data.sources.length === 1 ? "" : "s"} selected.
                        Advanced field mapping can be reviewed after setup.
                      </p>
                      {data.mappings.some(
                        (m) => !m.confirmed && !m.ignored,
                      ) && (
                        <div className="wizard-warning">
                          Some fields need review. Your workspace will open with
                          limited intelligence until mappings are confirmed.
                        </div>
                      )}
                    </details>
                  )}
                  <button
                    className="text-button"
                    onClick={() => setConsent(true)}
                  >
                    Change sample account
                  </button>
                </>
              )}
            </>
          )}
          {step === "team" && company && (
            <TeamInvites
              company={company}
              compact
              onInvited={(count) => {
                setTeamSent(true);
                setPending((p) => (p || 0) + count);
              }}
              onDraftChange={setHasDraft}
              onBusyChange={setInvitationBusy}
              onComplete={() => {
                setTeamSent(true);
                advance();
              }}
            />
          )}
          {step === "finish" && company && data && (
            <>
              <div className="wizard-summary">
                <div>
                  <span>Company</span>
                  <strong>{company.name}</strong>
                  <button onClick={() => visit(0)}>Edit</button>
                </div>
                <div>
                  <span>Departments</span>
                  <strong>
                    {data.departments.length
                      ? data.departments.join(", ")
                      : "Add later"}
                  </strong>
                  <button onClick={() => visit(1)}>Edit</button>
                </div>
                <div>
                  <span>Data</span>
                  <strong>
                    {data.connected && data.sources.length
                      ? `${data.sources.length} sample spreadsheets`
                      : "Not connected · add later"}
                  </strong>
                  <button onClick={() => visit(2)}>Edit</button>
                </div>
                <div>
                  <span>Team</span>
                  <strong>
                    {pending === null
                      ? "Review invitations in workspace"
                      : `${pending} pending invitation${pending === 1 ? "" : "s"}`}
                  </strong>
                  <button onClick={() => visit(3)}>Edit</button>
                </div>
              </div>
              <p className="wizard-finish-note">
                {data.connected && data.sources.length
                  ? "You’re using sample data. No live company analysis has run."
                  : "Your workspace is ready to explore. Connect data whenever you’re ready."}
              </p>
            </>
          )}
          <footer className="wizard-actions">
            <Button
              variant="text"
              disabled={busy || invitationBusy}
              onClick={back}
            >
              <ArrowLeft size={15} /> Back
            </Button>
            <div>
              {["structure", "connect", "team"].includes(step) && (
                <Button
                  variant="text"
                  disabled={busy || invitationBusy}
                  onClick={() => advance(true)}
                >
                  Skip for now
                </Button>
              )}
              {step === "company" ? (
                <Button busy={busy} type="submit" form="wizard-company">
                  Continue <ArrowRight size={16} />
                </Button>
              ) : step === "team" ? (
                <Button
                  busy={busy || invitationBusy}
                  type={hasDraft ? "submit" : "button"}
                  form={hasDraft ? "wizard-invitations" : undefined}
                  disabled={!hasDraft && !teamSent && !pending}
                  onClick={!hasDraft ? () => advance() : undefined}
                >
                  {hasDraft ? "Send invitations" : "Continue"}
                  <ArrowRight size={16} />
                </Button>
              ) : step === "connect" && !data?.connected ? (
                <Button busy={busy} onClick={() => setConsent(true)}>
                  Connect Google Sheets <ArrowRight size={16} />
                </Button>
              ) : (
                <Button
                  busy={busy}
                  disabled={step === "connect" && !data?.sources.length}
                  onClick={() => advance()}
                >
                  {step === "finish" ? "Finish setup" : "Continue"}
                  <ArrowRight size={16} />
                </Button>
              )}
            </div>
          </footer>
        </main>
      )}
      {consent && (
        <Modal title="Connect Google Sheets" onClose={() => setConsent(false)}>
          <p>
            Read-only access to selected sample spreadsheets. Your original
            files stay yours.
          </p>
          <div className="dev-note">
            <ShieldCheck size={16} />
            <span>
              Simulated authorization. No real Google account is connected.
            </span>
          </div>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConsent(false);
                setError(
                  "Access wasn’t granted. Try connecting again, or skip for now.",
                );
              }}
            >
              Deny access
            </Button>
            <Button
              busy={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/config");
                  if (data) {
                    const d = { ...data, connected: true, demo: true };
                    if (await persist(d)) {
                      setError("");
                      setConsent(false);
                    }
                  }
                } catch (e) {
                  setError((e as Error).message);
                  setConsent(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Allow sample access
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function DepartmentIcon({ index }: { index: number }) {
  const Icon = [
    BarChart3,
    Target,
    BriefcaseBusiness,
    Users,
    Activity,
    Settings2,
  ][index % 6];
  return <Icon size={19} />;
}
