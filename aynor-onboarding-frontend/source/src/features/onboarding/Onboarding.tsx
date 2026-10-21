import { sampleAdapter } from "../integrations/sampleAdapter";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  Building2,
  Check,
  CircleHelp,
  Compass,
  FileSpreadsheet,
  Link2,
  LockKeyhole,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Modal,
  Select,
  Tick,
} from "../../components/ui";
import {
  api,
  departmentOptions,
  priorityOptions,
  sampleSources,
  steps,
  type Company,
  type WorkspaceData,
} from "../../lib/api";
import { useApp } from "../../lib/context";
import { TeamInvites } from "../team/Team";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
const headlines: Record<string, [string, string]> = {
  departments: [
    "How does your company work?",
    "A little structure. A lot more clarity. Choose your departments.",
  ],
  priorities: [
    "What matters most?",
    "Choose the priorities you want Aynor to keep in focus.",
  ],
  integrations: [
    "Connect the dots.",
    "Bring your business data into your workspace.",
  ],
  sources: [
    "Choose your sources.",
    "Start with the spreadsheets that tell your business story.",
  ],
  discovery: [
    "Finding the connections.",
    "A clearer picture starts with understanding your sources.",
  ],
  mapping: [
    "Make sense of everything.",
    "Confirm what your fields mean. You know your business best.",
  ],
  readiness: [
    "Here’s what we found.",
    "An honest look at what your workspace can do today.",
  ],
  kpis: [
    "Measure what matters.",
    "Turn confirmed data into meaningful measures of performance.",
  ],
  goals: [
    "Where are you heading?",
    "Give your ambitions a clear target and a time frame.",
  ],
  invite: [
    "Better decisions, together.",
    "Bring the right people into your workspace.",
  ],
  review: [
    "Everything in its place.",
    "One last look at your workspace. Every detail is yours to refine.",
  ],
  complete: ["Your workspace is ready.", "Everything important, in one place."],
};

export function Onboarding({
  company,
  step,
  save,
  busy,
  onReload,
}: {
  company: Company;
  step: string;
  save: (d: WorkspaceData) => Promise<boolean | undefined>;
  busy: boolean;
  onReload: () => void;
}) {
  const nav = useNavigate(),
    { toast } = useApp();
  const [connecting, setConnecting] = useState(false);
  const [invitationCount, setInvitationCount] = useState<number | null>(null);
  const [pendingNav, setPendingNav] = useState("");
  const [data, setData] = useState<WorkspaceData>(() =>
      structuredClone(company.data),
    ),
    [custom, setCustom] = useState(""),
    [error, setError] = useState(""),
    [sourceSearch, setSourceSearch] = useState(""),
    [manual, setManual] = useState(""),
    [processing, setProcessing] = useState(-1),
    [discoveryError, setDiscoveryError] = useState(""),
    [modal, setModal] = useState(""),
    [goal, setGoal] = useState({
      name: "",
      kpi: "",
      target: "",
      deadline: "",
      owner: "",
    });
  const index = steps.indexOf(step);
  const heading = headlines[step];
  const dirty = JSON.stringify(data) !== JSON.stringify(company.data);
  useEffect(() => {
    if (step === "review")
      api(`/companies/${company.id}/invitations`)
        .then((r) =>
          setInvitationCount(
            r.filter((i: { status: string }) => i.status === "pending").length,
          ),
        )
        .catch(() => setInvitationCount(null));
  }, [step, company.id]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const intercept = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a &&
        a.origin === location.origin &&
        a.pathname !== location.pathname &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault();
        e.stopPropagation();
        setPendingNav(a.pathname + a.search);
      }
    };
    document.addEventListener("click", intercept, true);
    return () => document.removeEventListener("click", intercept, true);
  }, [dirty]);
  if (step === "company")
    return <CompanyProfile company={company} onReload={onReload} />;
  if (!heading)
    return (
      <Empty
        title="This setup step doesn’t exist"
        description="Return to your current setup."
        action={
          <Link
            className="button"
            to={`/companies/${company.id}/onboarding/${company.data.step || "departments"}`}
          >
            Resume setup
          </Link>
        }
      />
    );
  const change = (key: keyof WorkspaceData, value: unknown) =>
    setData((d) => ({ ...d, [key]: value }));
  const toggle = (
    key: "departments" | "priorities" | "sources",
    value: string,
  ) => {
    if (
      key === "departments" &&
      data.mappings.some((m) => m.department === value && !m.ignored)
    ) {
      setError(
        "This department has mappings. Reassign or ignore them before removing it.",
      );
      return;
    }
    change(
      key,
      data[key].includes(value)
        ? data[key].filter((x) => x !== value)
        : [...data[key], value],
    );
  };
  async function next(skip = false) {
    setError("");
    if (
      !skip &&
      step === "mapping" &&
      data.mappings.some((m) => !m.confirmed && !m.ignored)
    ) {
      setError("Confirm or ignore every field before continuing.");
      return;
    }
    if (!skip && step === "sources" && !data.sources.length) {
      setError("Select at least one sample source, or skip this step.");
      return;
    }
    if (
      !skip &&
      step === "discovery" &&
      data.sources.length &&
      !data.discovered
    ) {
      setError("Run discovery, or skip for now.");
      return;
    }
    const nextStep = steps[Math.min(index + 1, steps.length - 1)];
    const updated = {
      ...data,
      steps: { ...data.steps, [step]: skip ? "skipped" : "completed" },
      step: nextStep,
      ...(step === "review" ? { completed: true } : {}),
    };
    if (await save(updated)) {
      nav(
        `/companies/${company.id}/${step === "complete" ? "overview" : "onboarding/" + nextStep}`,
      );
    }
  }
  function addCustom(key: "departments" | "priorities") {
    const name = custom.trim();
    if (
      !name ||
      name.length > 80 ||
      data[key].some((x) => x.toLowerCase() === name.toLowerCase())
    ) {
      setError("Enter a unique name, between 1 and 80 characters.");
      return;
    }
    change(key, [...data[key], name]);
    setCustom("");
    setError("");
  }
  async function discover() {
    setDiscoveryError("");
    if (!data.sources.length) {
      setDiscoveryError("Select a source before starting discovery.");
      return;
    }
    setProcessing(0);
    try {
      const fields = sampleAdapter.discover(data.sources, data.departments);
      setProcessing(1);
      const updated = {
        ...data,
        discovered: true,
        mappings: fields,
        steps: { ...data.steps, discovery: "completed" },
      };
      if (await save(updated)) {
        setData(updated);
        setProcessing(4);
        toast("Sample structures loaded. Review the proposed mappings.");
      } else {
        setProcessing(-1);
        setDiscoveryError("Discovery could not be saved. Reload and retry.");
      }
    } catch (e) {
      setDiscoveryError(message(e));
      setProcessing(-1);
    }
  }
  return (
    <>
      <div className="setup-heading">
        <div className="page-kicker">
          <span className="tiny-blue-dot" />
          {step === "complete"
            ? "A STRONG START"
            : index < 2
              ? "MAKE IT YOURS"
              : index < 9
                ? "BUILD YOUR INTELLIGENCE"
                : "THE BIGGER PICTURE"}
        </div>
        <div className="setup-title-row">
          <div>
            <h1>{heading[0]}</h1>
            <p>{heading[1]}</p>
          </div>
          <span className="step-number">
            {String(index + 1).padStart(2, "0")}
            <small> / 12</small>
          </span>
        </div>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="step-content">
        {step === "departments" && (
          <>
            <div className="section-line">
              <h3>Your company structure</h3>
              <span className="subtle">{data.departments.length} selected</span>
            </div>
            <div className="department-grid">
              {[...new Set([...departmentOptions, ...data.departments])].map(
                (d, i) => {
                  const Icon = [
                    BarChart3,
                    Target,
                    BriefcaseBusiness,
                    Users,
                    Activity,
                    Settings2,
                  ][i % 6];
                  return (
                    <button
                      key={d}
                      aria-pressed={data.departments.includes(d)}
                      onClick={() => toggle("departments", d)}
                      className={
                        "department-tile " +
                        (data.departments.includes(d) ? "selected" : "")
                      }
                    >
                      <span className="department-icon">
                        <Icon size={19} />
                      </span>
                      <Tick selected={data.departments.includes(d)} />
                      <strong>{d}</strong>
                      <small>
                        {
                          [
                            "Revenue, expenses & cash flow",
                            "Pipeline, clients & growth",
                            "Projects, milestones & outcomes",
                            "People, capacity & culture",
                            "Reach, campaigns & engagement",
                            "Processes, resources & efficiency",
                          ][i % 6]
                        }
                      </small>
                    </button>
                  );
                },
              )}
            </div>
            <div className="custom-row">
              <Plus size={16} />
              <input
                aria-label="Custom department"
                placeholder="A different structure? Add a department"
                value={custom}
                maxLength={80}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustom("departments");
                  }
                }}
              />
              <Button variant="text" onClick={() => addCustom("departments")}>
                Add department <ArrowUpRight size={14} />
              </Button>
            </div>
            {data.departments.length > 0 && (
              <details className="department-editor">
                <summary>Arrange & refine your departments</summary>
                {data.departments.map((d, i) => (
                  <div className="compact-row" key={i}>
                    <input
                      aria-label={`Rename ${d}`}
                      defaultValue={d}
                      maxLength={80}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (
                          !v ||
                          data.departments.some(
                            (x, j) =>
                              j !== i && x.toLowerCase() === v.toLowerCase(),
                          )
                        ) {
                          e.target.value = d;
                          setError("Use a unique, non-empty department name.");
                          return;
                        }
                        change(
                          "departments",
                          data.departments.map((x, j) => (j === i ? v : x)),
                        );
                        change(
                          "mappings",
                          data.mappings.map((m) =>
                            m.department === d ? { ...m, department: v } : m,
                          ),
                        );
                      }}
                    />
                    <button
                      className="icon-button"
                      disabled={i === 0}
                      aria-label={`Move ${d} up`}
                      onClick={() => {
                        const a = [...data.departments];
                        [a[i - 1], a[i]] = [a[i], a[i - 1]];
                        change("departments", a);
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={i === data.departments.length - 1}
                      aria-label={`Move ${d} down`}
                      onClick={() => {
                        const a = [...data.departments];
                        [a[i + 1], a[i]] = [a[i], a[i + 1]];
                        change("departments", a);
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${d}`}
                      aria-pressed={data.departments.includes(d)}
                      onClick={() => toggle("departments", d)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </details>
            )}
            <div className="quiet-note">
              <Sparkles size={16} />
              <span>
                Aynor adapts to how your business works. You can change this at
                any time.
              </span>
            </div>
          </>
        )}
        {step === "priorities" && (
          <>
            <div className="priority-grid">
              {[...new Set([...priorityOptions, ...data.priorities])].map(
                (p, i) => (
                  <button
                    className={
                      "priority-card " +
                      (data.priorities.includes(p) ? "selected" : "")
                    }
                    key={p}
                    aria-pressed={data.priorities.includes(p)}
                    onClick={() => toggle("priorities", p)}
                  >
                    <span className="priority-index">0{i + 1}</span>
                    <strong>{p}</strong>
                    <Tick selected={data.priorities.includes(p)} />
                  </button>
                ),
              )}
            </div>
            <div className="custom-row">
              <Plus size={16} />
              <input
                aria-label="Custom priority"
                placeholder="Add a priority unique to your business"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              <Button variant="text" onClick={() => addCustom("priorities")}>
                Add priority
              </Button>
            </div>
            <div className="quiet-note">
              <Compass size={17} />
              <span>
                Your priorities guide recommendations. Metrics only come from
                confirmed data.
              </span>
            </div>
          </>
        )}
        {step === "integrations" && (
          <>
            <div className="integration-feature">
              <div className="section-line">
                <span className="sheets-logo">
                  <FileSpreadsheet size={30} />
                </span>
                <Badge tone={data.connected ? "success" : ""}>
                  {data.connected ? "Sample adapter active" : "Not connected"}
                </Badge>
              </div>
              <h2>Google Sheets</h2>
              <p>
                Your spreadsheets. A more connected perspective.
                <br />
                Bring finance, delivery, and team data into one place.
              </p>
              <div className="permission-summary">
                <h4>
                  <ShieldCheck size={15} /> A thoughtful approach to your data
                </h4>
                <span>
                  <Check size={14} /> Read-only access to the sources you select
                </span>
                <span>
                  <Check size={14} /> No changes to your original spreadsheets
                </span>
                <span>
                  <Check size={14} /> Company-specific connection and
                  permissions
                </span>
              </div>
              <ErrorBox>
                {modal === "denied"
                  ? "Access wasn’t granted. Your workspace hasn’t changed. Retry the connection or continue with sample data."
                  : null}
              </ErrorBox>
              <Button busy={connecting} onClick={() => setModal("connect")}>
                <Link2 size={16} /> Connect Google Sheets{" "}
                <ArrowUpRight size={16} />
              </Button>
            </div>
            <div className="sample-banner">
              <div>
                <Badge>PROTOTYPE ADAPTER</Badge>
                <h3>Take a look around first.</h3>
                <p>
                  Use clearly labeled sample sources. No Google account is
                  connected.
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  change("demo", true);
                  change("connected", true);
                  toast(
                    "Sample adapter selected. No Google connection was made.",
                  );
                }}
              >
                {data.connected ? (
                  <>
                    <Check size={15} /> Sample adapter selected
                  </>
                ) : (
                  "Explore with sample data"
                )}
              </Button>
            </div>
            {data.connected && (
              <Button variant="text" onClick={() => setModal("disconnect")}>
                Disconnect sample adapter
              </Button>
            )}
          </>
        )}
        {step === "sources" && (
          <>
            {!data.connected ? (
              <Empty
                title="Connect a source to get started"
                description="Connect Google Sheets when configured, or use the sample adapter to explore."
                action={
                  <Link
                    className="button"
                    to={`/companies/${company.id}/onboarding/integrations`}
                  >
                    Go to connections <ArrowRight size={15} />
                  </Link>
                }
              />
            ) : (
              <>
                <div className="section-line">
                  <Badge>ILLUSTRATIVE SAMPLE SOURCES</Badge>
                  <Button
                    variant="text"
                    onClick={() => {
                      setSourceSearch("");
                      toast(
                        "Sample source list refreshed. No Google API request was made.",
                      );
                    }}
                  >
                    Refresh sources
                  </Button>
                </div>
                <div className="search-input source-search">
                  <Search size={16} />
                  <input
                    aria-label="Search spreadsheets"
                    placeholder="Search spreadsheets…"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                  />
                </div>
                <div className="source-list">
                  {sampleSources
                    .filter((s) =>
                      s.toLowerCase().includes(sourceSearch.toLowerCase()),
                    )
                    .map((s, i) => (
                      <div
                        className={
                          "source-row " +
                          (data.sources.includes(s) ? "selected" : "")
                        }
                        key={s}
                      >
                        <button
                          className="source-check"
                          onClick={() => {
                            toggle("sources", s);
                            change("discovered", false);
                            change("mappings", []);
                            change("kpis", []);
                          }}
                          aria-label={`Select ${s}`}
                        >
                          <Tick selected={data.sources.includes(s)} />
                        </button>
                        <FileSpreadsheet size={21} />
                        <div>
                          <strong>{s}</strong>
                          <small>Sample workbook · No live account</small>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setModal("preview" + i)}
                        >
                          Preview tabs <ArrowUpRight size={13} />
                        </button>
                      </div>
                    ))}
                </div>
                <div className="quiet-note">
                  <ShieldCheck size={16} />
                  <span>
                    These files are built-in examples, not your Google Drive
                    files.
                  </span>
                </div>
              </>
            )}
            <div className="manual-source">
              <h4>Have a spreadsheet link?</h4>
              <div className="custom-row">
                <Link2 size={16} />
                <input
                  aria-label="Google spreadsheet URL"
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                />
                <Button
                  variant="text"
                  onClick={() => {
                    if (
                      !/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(
                        manual,
                      )
                    ) {
                      setError(
                        "Enter a valid Google Sheets URL beginning with https://docs.google.com/spreadsheets/d/.",
                      );
                      return;
                    }
                    change("demo", true);
                    change("connected", true);
                    change("sources", [
                      ...new Set([...data.sources, sampleSources[0]]),
                    ]);
                    change("discovered", false);
                    change("mappings", []);
                    change("kpis", []);
                    setManual("");
                    setError("");
                    toast(
                      "Sample workbook added for preview. No real file was accessed.",
                    );
                  }}
                >
                  Add source
                </Button>
              </div>
            </div>
          </>
        )}
        {step === "discovery" && (
          <>
            <div className="discovery-panel">
              <span
                className={
                  "discovery-orb " +
                  (processing >= 0 && processing < 4 ? "working" : "")
                }
              >
                <Sparkles size={31} />
              </span>
              <h2>
                {data.discovered
                  ? "A structure worth exploring."
                  : "Let’s look beneath the surface."}
              </h2>
              <p>
                {data.sources.length} sample source
                {data.sources.length !== 1 ? "s" : ""} selected · Simulated data
              </p>
              <div className="discovery-stages">
                {[
                  "Read sample source definitions",
                  "Identify example structures",
                  "Identify business fields",
                  "Prepare proposed relationships",
                  "Save mapping suggestions",
                ].map((s, i) => (
                  <div
                    key={s}
                    className={data.discovered || processing >= i ? "done" : ""}
                  >
                    <span>
                      {data.discovered || processing > i ? (
                        <Check size={13} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    {s}
                  </div>
                ))}
              </div>
              <Button
                onClick={discover}
                busy={processing >= 0 && processing < 4}
              >
                {data.discovered
                  ? "Run sample discovery again"
                  : "Discover sample structures"}
                <ArrowRight size={16} />
              </Button>
              <ErrorBox>{discoveryError}</ErrorBox>
              <p className="micro-note">
                Processes built-in sample definitions locally. No live
                spreadsheet analysis.
              </p>
            </div>
          </>
        )}
        {step === "mapping" && (
          <>
            {!data.mappings.length ? (
              <Empty
                title="No discovered fields yet"
                description="Discover source structures before configuring mappings."
                action={
                  <Link
                    className="button"
                    to={`/companies/${company.id}/onboarding/discovery`}
                  >
                    Discover data
                  </Link>
                }
              />
            ) : (
              <>
                <div className="section-line">
                  <Badge>PROPOSED SAMPLE MAPPINGS</Badge>
                  <span className="subtle">
                    {
                      data.mappings.filter((m) => m.confirmed && !m.ignored)
                        .length
                    }{" "}
                    confirmed
                  </span>
                </div>
                <div className="mapping-table">
                  <div className="mapping-head">
                    <span>SOURCE FIELD</span>
                    <span>DEPARTMENT</span>
                    <span>BUSINESS MEANING</span>
                    <span>CONFIRM</span>
                  </div>
                  {data.mappings.map((m, i) => (
                    <div
                      className={"mapping-row " + (m.ignored ? "ignored" : "")}
                      key={i}
                    >
                      <span>
                        <FileSpreadsheet size={15} />
                        {m.field}
                      </span>
                      <select
                        aria-label={`Department for ${m.field}`}
                        value={m.department}
                        disabled={m.ignored}
                        onChange={(e) =>
                          change(
                            "mappings",
                            data.mappings.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    department: e.target.value,
                                    confirmed: false,
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        <option value="">Choose department</option>
                        {data.departments.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                      <input
                        aria-label={`Meaning for ${m.field}`}
                        value={m.meaning}
                        disabled={m.ignored}
                        onChange={(e) =>
                          change(
                            "mappings",
                            data.mappings.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    meaning: e.target.value,
                                    confirmed: false,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      <div>
                        <button
                          className="icon-button"
                          aria-label={`Confirm ${m.field}`}
                          disabled={
                            !m.department || !m.meaning.trim() || m.ignored
                          }
                          onClick={() =>
                            change(
                              "mappings",
                              data.mappings.map((x, j) =>
                                j === i ? { ...x, confirmed: !x.confirmed } : x,
                              ),
                            )
                          }
                        >
                          <Tick selected={m.confirmed} />
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${m.ignored ? "Restore" : "Ignore"} ${m.field}`}
                          onClick={() =>
                            change(
                              "mappings",
                              data.mappings.map((x, j) =>
                                j === i
                                  ? {
                                      ...x,
                                      ignored: !x.ignored,
                                      confirmed: false,
                                    }
                                  : x,
                              ),
                            )
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="quiet-note">
                  <ShieldCheck size={17} />
                  <span>
                    High-impact fields require your confirmation. Ambiguous
                    relationships stay unconfirmed.
                  </span>
                </div>
              </>
            )}
            <div className="custom-row">
              <Plus size={16} />
              <input
                aria-label="New field name"
                placeholder="Add a custom field mapping"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
              />
              <Button
                variant="text"
                onClick={() => {
                  if (
                    !custom.trim() ||
                    data.mappings.some(
                      (m) =>
                        m.field.toLowerCase() === custom.trim().toLowerCase(),
                    )
                  ) {
                    setError("Use a unique field name.");
                    return;
                  }
                  change("mappings", [
                    ...data.mappings,
                    {
                      field: custom.trim(),
                      department: data.departments[0] || "",
                      meaning: "",
                      confirmed: false,
                    },
                  ]);
                  setCustom("");
                }}
              >
                Add mapping
              </Button>
            </div>
          </>
        )}
        {step === "readiness" && (
          <>
            <div className="readiness-callout">
              <span className="empty-icon">
                <Activity size={23} />
              </span>
              <div>
                <h3>
                  {data.mappings.some((m) => m.confirmed && !m.ignored)
                    ? "Ready to explore sample intelligence."
                    : "Your workspace needs a little more context."}
                </h3>
                <p>
                  {data.demo
                    ? "Sample data only. Live business intelligence is not available."
                    : "No valid source connected. Your workspace is available with limitations."}
                </p>
              </div>
            </div>
            <div className="readiness-list">
              {data.departments.length ? (
                data.departments.map((d) => {
                  const confirmed = data.mappings.filter(
                    (m) => m.department === d && m.confirmed && !m.ignored,
                  ).length;
                  return (
                    <div className="readiness-row" key={d}>
                      <span>
                        <Building2 size={17} />
                        {d}
                      </span>
                      <small>
                        {confirmed} confirmed field{confirmed !== 1 ? "s" : ""}
                      </small>
                      <Badge tone={confirmed ? "success" : "warning"}>
                        {confirmed ? "Sample mapping ready" : "Needs mapping"}
                      </Badge>
                    </div>
                  );
                })
              ) : (
                <Empty
                  title="No departments selected"
                  description="Choose departments to organize your intelligence."
                />
              )}
            </div>
            <div className="capability-grid">
              <div>
                <Check size={17} />
                <h4>Available now</h4>
                <p>
                  Company setup, goals, team access, and sample data
                  exploration.
                </p>
              </div>
              <div>
                <LockKeyhole size={17} />
                <h4>Needs live data</h4>
                <p>
                  Actual performance, business alerts, evidence-backed
                  recommendations.
                </p>
              </div>
            </div>
            <Link
              className="text-button"
              to={`/companies/${company.id}/onboarding/mapping`}
            >
              Review mappings <ArrowUpRight size={13} />
            </Link>
          </>
        )}
        {step === "kpis" && (
          <>
            <div className="quiet-note">
              <BarChart3 size={17} />
              <span>
                Define how you measure performance. Sample mappings never
                produce real business metrics.
              </span>
            </div>
            {data.kpis.length === 0 && (
              <Empty
                title="Your metrics, thoughtfully defined."
                description="Choose a KPI based on a confirmed mapping, or define a manual metric."
              />
            )}
            {data.kpis.map((k, i) => (
              <div className="kpi-card" key={i}>
                <div className="section-line">
                  <h3>{k.name}</h3>
                  <div>
                    <Badge>
                      {data.mappings.some(
                        (m) =>
                          m.confirmed &&
                          m.meaning.toLowerCase() === k.name.toLowerCase(),
                      )
                        ? "Sample mapping ready"
                        : "Manual data required"}
                    </Badge>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${k.name}`}
                      onClick={() =>
                        change(
                          "kpis",
                          data.kpis.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="form-grid">
                  <Field
                    label="Calculation"
                    value={k.calculation}
                    placeholder="e.g. Sum of monthly revenue"
                    onChange={(e) =>
                      change(
                        "kpis",
                        data.kpis.map((x, j) =>
                          j === i ? { ...x, calculation: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Field
                    label="Target"
                    type="number"
                    value={k.target}
                    placeholder="Set a target"
                    onChange={(e) =>
                      change(
                        "kpis",
                        data.kpis.map((x, j) =>
                          j === i ? { ...x, target: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Department"
                    value={k.department}
                    options={data.departments}
                    onChange={(v) =>
                      change(
                        "kpis",
                        data.kpis.map((x, j) =>
                          j === i ? { ...x, department: v } : x,
                        ),
                      )
                    }
                  />
                  <Select
                    label="Reporting period"
                    value={k.period}
                    options={["Monthly", "Quarterly", "Yearly"]}
                    onChange={(v) =>
                      change(
                        "kpis",
                        data.kpis.map((x, j) =>
                          j === i ? { ...x, period: v } : x,
                        ),
                      )
                    }
                  />
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={k.enabled}
                    onChange={(e) =>
                      change(
                        "kpis",
                        data.kpis.map((x, j) =>
                          j === i ? { ...x, enabled: e.target.checked } : x,
                        ),
                      )
                    }
                  />{" "}
                  Enable this KPI
                </label>
              </div>
            ))}
            <div className="custom-row">
              <Plus size={16} />
              <input
                aria-label="KPI name"
                list="suggested-kpis"
                value={custom}
                placeholder="Choose or name a metric"
                onChange={(e) => setCustom(e.target.value)}
              />
              <datalist id="suggested-kpis">
                {data.mappings
                  .filter((m) => m.confirmed && !m.ignored)
                  .map((m) => (
                    <option key={m.field} value={m.meaning} />
                  ))}
              </datalist>
              <Button
                variant="text"
                onClick={() => {
                  if (
                    !custom.trim() ||
                    data.kpis.some(
                      (k) =>
                        k.name.toLowerCase() === custom.trim().toLowerCase(),
                    )
                  ) {
                    setError("Enter a unique metric name.");
                    return;
                  }
                  change("kpis", [
                    ...data.kpis,
                    {
                      name: custom.trim(),
                      department: data.departments[0] || "",
                      target: "",
                      period: "Monthly",
                      enabled: true,
                      calculation: "",
                    },
                  ]);
                  setCustom("");
                }}
              >
                Add metric
              </Button>
            </div>
          </>
        )}
        {step === "goals" && (
          <>
            <div className="section-line">
              <h3>A direction worth measuring</h3>
              <Button variant="secondary" onClick={() => setModal("goal")}>
                <Plus size={15} /> Add goal
              </Button>
            </div>
            {data.goals.length ? (
              data.goals.map((g, i) => (
                <div className="goal-row" key={g.id}>
                  <span className="goal-icon">
                    <Target size={21} />
                  </span>
                  <div>
                    <h3>{g.name}</h3>
                    <p>
                      {g.kpi || "Manual goal"} · Target: {g.target} · Due{" "}
                      {g.deadline}
                    </p>
                    {g.owner && <small>Owner: {g.owner}</small>}
                  </div>
                  <Button
                    variant="text"
                    onClick={() => {
                      setGoal(g);
                      setModal("editgoal" + i);
                    }}
                  >
                    Edit
                  </Button>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${g.name}`}
                    onClick={() =>
                      change(
                        "goals",
                        data.goals.filter((x) => x.id !== g.id),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            ) : (
              <Empty
                title="A little ambition goes a long way."
                description="Add a business goal now, or come back when you’re ready."
                action={
                  <Button variant="secondary" onClick={() => setModal("goal")}>
                    <Plus size={15} /> Set your first goal
                  </Button>
                }
              />
            )}
            <div className="quiet-note">
              <Target size={16} />
              <span>
                Goals reflect your targets. Progress appears only when valid
                data is available.
              </span>
            </div>
          </>
        )}
        {step === "invite" && <TeamInvites company={company} />}
        {step === "review" && (
          <>
            <div className="review-company">
              <span className="company-initial">
                {company.name.slice(0, 2).toUpperCase()}
              </span>
              <div>
                <h2>{company.name}</h2>
                <p>
                  {company.industry} · {company.country} · {company.currency}
                </p>
              </div>
              <Link
                className="text-button"
                to={`/companies/${company.id}/onboarding/company`}
              >
                Edit profile <ArrowUpRight size={13} />
              </Link>
            </div>
            <div className="review-list">
              {[
                ["Departments", String(data.departments.length), "departments"],
                [
                  "Business priorities",
                  String(data.priorities.length),
                  "priorities",
                ],
                [
                  "Connected sources",
                  `${data.sources.length} ${data.demo ? "sample sources" : "live sources"}`,
                  "integrations",
                ],
                [
                  "Confirmed mappings",
                  String(
                    data.mappings.filter((m) => m.confirmed && !m.ignored)
                      .length,
                  ),
                  "mapping",
                ],
                [
                  "Performance metrics",
                  String(data.kpis.filter((k) => k.enabled).length),
                  "kpis",
                ],
                ["Company goals", String(data.goals.length), "goals"],
                [
                  "Team invitations",
                  invitationCount === null
                    ? "Count unavailable"
                    : `${invitationCount} pending`,
                  "invite",
                ],
              ].map(([label, value, s]) => (
                <div className="review-row" key={s}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <Link to={`/companies/${company.id}/onboarding/${s}`}>
                    Edit <ArrowUpRight size={13} />
                  </Link>
                </div>
              ))}
            </div>
            <div className="quiet-note">
              <CircleHelp size={17} />
              <span>
                {data.demo
                  ? "Your setup uses sample data. Real business analysis requires a live integration."
                  : "No live data is connected. Enter a limited workspace and connect sources later."}
              </span>
            </div>
            <div className="skipped-summary">
              {
                Object.entries(data.steps).filter(([, v]) => v === "skipped")
                  .length
              }{" "}
              optional steps skipped. You can return to these anytime.
            </div>
          </>
        )}
        {step === "complete" && (
          <div className="completion">
            <div className="completion-mark">
              <Check size={35} />
            </div>
            <div className="page-kicker">A CLEARER PERSPECTIVE STARTS HERE</div>
            <h2>
              Make room for
              <br />
              <span className="accent">better decisions.</span>
            </h2>
            <p>
              {company.name} has a place of its own.
              <br />
              Your workspace is ready to explore.
            </p>
            <Badge tone="warning">
              {data.demo
                ? "Sample data workspace"
                : "Limited workspace · No live source"}
            </Badge>
            <Link className="button" to={`/companies/${company.id}/overview`}>
              Open dashboard <ArrowRight size={17} />
            </Link>
            <small>Setup is saved. You can refine every detail later.</small>
          </div>
        )}
      </div>
      {step !== "complete" && (
        <div className="step-footer">
          <Button
            variant="text"
            onClick={async () => {
              if (dirty && !(await save(data))) return;
              nav(
                index === 0
                  ? "/companies"
                  : `/companies/${company.id}/onboarding/${steps[index - 1]}`,
              );
            }}
          >
            <ArrowLeft size={15} /> Back
          </Button>
          <div>
            <span className="save-status">
              {busy
                ? "Saving…"
                : dirty
                  ? "Changes ready to save"
                  : "Progress saved"}
            </span>
            {step !== "review" && (
              <Button variant="text" disabled={busy} onClick={() => next(true)}>
                Skip for now
              </Button>
            )}
            <Button busy={busy} onClick={() => next()}>
              {step === "review"
                ? "Enter Aynor"
                : step === "sources"
                  ? "Use selected sources"
                  : "Continue"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}
      <div className="finish-later">
        <button
          onClick={async () => {
            if (await save({ ...data, step })) {
              toast("Your progress is saved. Pick up where you left off.");
              nav(`/companies/${company.id}/overview`);
            }
          }}
        >
          Save & finish later <ArrowUpRight size={12} />
        </button>
      </div>
      {pendingNav && (
        <Modal
          title="Keep your latest changes?"
          onClose={() => setPendingNav("")}
        >
          <p>
            You have changes on this step. Save them before moving on, or leave
            without saving.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                nav(pendingNav);
                setPendingNav("");
              }}
            >
              Discard changes
            </Button>
            <Button
              busy={busy}
              onClick={async () => {
                if (await save(data)) {
                  nav(pendingNav);
                  setPendingNav("");
                }
              }}
            >
              Save & continue
            </Button>
          </div>
        </Modal>
      )}
      {modal === "connect" && (
        <Modal title="Connect Google Sheets" onClose={() => setModal("")}>
          <Badge>SIMULATED GOOGLE AUTHORIZATION</Badge>
          <div className="connected-account">
            <span className="sheets-logo">
              <FileSpreadsheet size={27} />
            </span>
            <div>
              <strong>Choose what Aynor can see.</strong>
              <p>
                Read-only access to selected sample workbooks. Your original
                files stay yours.
              </p>
            </div>
          </div>
          <div className="permission-summary">
            <span>
              <Check size={14} /> View selected spreadsheet data
            </span>
            <span>
              <Check size={14} /> No edits to source files
            </span>
            <span>
              <Check size={14} /> Disconnect at any time
            </span>
          </div>
          <p>
            This is a frontend demonstration. No Google account or live data is
            accessed.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setModal("denied");
              }}
            >
              Deny access
            </Button>
            <Button
              busy={connecting}
              onClick={async () => {
                setConnecting(true);
                try {
                  await api("/config");
                  change("demo", true);
                  change("connected", true);
                  setModal("");
                  toast(
                    "Sample Google connection complete. No real account was connected.",
                  );
                } catch (e) {
                  setError(message(e));
                  setModal("");
                } finally {
                  setConnecting(false);
                }
              }}
            >
              Allow sample access <ArrowRight size={15} />
            </Button>
          </div>
        </Modal>
      )}
      {modal.startsWith("preview") && (
        <Modal title="Sample workbook tabs" onClose={() => setModal("")}>
          <Badge>ILLUSTRATIVE STRUCTURE</Badge>
          <div className="preview-tabs">
            {["Summary", "Monthly data", "Reference"].map((t) => (
              <span key={t}>
                <FileSpreadsheet size={16} />
                {t}
              </span>
            ))}
          </div>
          <p>
            This preview describes a built-in sample workbook. No live Google
            file has been opened.
          </p>
          <Button onClick={() => setModal("")}>Close preview</Button>
        </Modal>
      )}
      {modal === "disconnect" && (
        <Modal title="Disconnect sample data?" onClose={() => setModal("")}>
          <p>
            This clears sample sources, mappings, and KPI definitions. Your
            company, departments, and goals remain.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setModal("")}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setData((d) => ({
                  ...d,
                  connected: false,
                  demo: false,
                  sources: [],
                  mappings: [],
                  kpis: [],
                  discovered: false,
                  steps: {
                    ...d.steps,
                    integrations: "not started",
                    sources: "not started",
                    discovery: "not started",
                    mapping: "not started",
                    readiness: "not started",
                    kpis: "not started",
                  },
                }));
                setModal("");
              }}
            >
              Disconnect
            </Button>
          </div>
        </Modal>
      )}
      {(modal === "goal" || modal.startsWith("editgoal")) && (
        <Modal
          title={
            modal === "goal" ? "Give your goal a direction" : "Refine your goal"
          }
          onClose={() => setModal("")}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const g = { ...goal, id: crypto.randomUUID() };
              if (modal === "goal") change("goals", [...data.goals, g]);
              else
                change(
                  "goals",
                  data.goals.map((x, i) =>
                    i === Number(modal.slice(8)) ? { ...g, id: x.id } : x,
                  ),
                );
              setGoal({
                name: "",
                kpi: "",
                target: "",
                deadline: "",
                owner: "",
              });
              setModal("");
            }}
          >
            <Field
              label="Goal name"
              required
              value={goal.name}
              onChange={(e) => setGoal({ ...goal, name: e.target.value })}
              placeholder="e.g. Grow recurring revenue"
            />
            <Select
              label="Related KPI"
              value={goal.kpi}
              options={data.kpis.map((k) => k.name)}
              onChange={(v) => setGoal({ ...goal, kpi: v })}
            />
            <div className="form-grid">
              <Field
                label="Target value"
                type="number"
                required
                value={goal.target}
                onChange={(e) => setGoal({ ...goal, target: e.target.value })}
              />
              <Field
                label="Deadline"
                type="date"
                required
                value={goal.deadline}
                onChange={(e) => setGoal({ ...goal, deadline: e.target.value })}
              />
            </div>
            <Field
              label="Goal owner (optional)"
              value={goal.owner}
              onChange={(e) => setGoal({ ...goal, owner: e.target.value })}
            />
            <Button type="submit">
              Save goal <Check size={16} />
            </Button>
          </form>
        </Modal>
      )}
    </>
  );
}

export function CompanyProfile({
  company,
  onReload,
}: {
  company: Company;
  onReload: () => void;
}) {
  const [profile, setProfile] = useState({
      name: company.name,
      industry: company.industry,
      country: company.country,
      currency: company.currency,
      timezone: company.timezone,
      website: company.website,
      size: company.size,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { toast } = useApp();
  const nav = useNavigate();
  const field = (key: keyof typeof profile, v: string) =>
    setProfile((p) => ({ ...p, [key]: v }));
  return (
    <>
      <div className="page-kicker">THE FOUNDATIONS</div>
      <div className="page-title-row">
        <div>
          <h1>Your company, in focus.</h1>
          <p>Keep the essentials up to date.</p>
        </div>
      </div>
      <div className="integration-feature">
        <ErrorBox>{error}</ErrorBox>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(`/companies/${company.id}/profile`, "PATCH", {
                ...profile,
                version: company.version,
              });
              toast("Company details saved.");
              onReload();
              nav(`/companies/${company.id}/onboarding/review`);
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {(
            ["name", "industry", "country", "currency", "timezone"] as const
          ).map((k) => (
            <Field
              key={k}
              label={
                {
                  name: "Company name",
                  industry: "Industry",
                  country: "Country",
                  currency: "Currency",
                  timezone: "Time zone",
                }[k]
              }
              required
              value={profile[k]}
              onChange={(e) => field(k, e.target.value)}
            />
          ))}
          <Field
            label="Website"
            type="url"
            value={profile.website}
            onChange={(e) => field("website", e.target.value)}
          />
          <Field
            label="Company size"
            value={profile.size}
            onChange={(e) => field("size", e.target.value)}
          />
          <div className="modal-actions">
            <Link
              className="button secondary"
              to={`/companies/${company.id}/onboarding/review`}
            >
              Back to review
            </Link>
            <Button type="submit" busy={busy}>
              Save company details <Check size={16} />
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
