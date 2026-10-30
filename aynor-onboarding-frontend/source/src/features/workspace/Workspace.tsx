import { serverMode } from "../../lib/runtime";
import { LiveOverview } from "../live/LiveOverview";
import { SignOutButton } from "../../components/SignOutButton";
import { Intelligence } from "../intelligence/Intelligence";
import {
  readPreferences,
  preferenceKey,
  usesExampleData,
} from "../dashboard/model";
import "./shell.css";
import { OnboardingFrame } from "../onboarding/OnboardingFrame";
import {
  CircleAlert,
  MessageSquare,
  Building2,
  Target,
  Network,
  ArrowUpRight,
  Check,
  ChevronDown,
  Search,
  Bell,
  CircleHelp,
  Compass,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Users,
  Settings2,
  Database,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState, type FocusEvent, type MouseEvent } from "react";
import {
  Link,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
} from "react-router-dom";
import {
  Button,
  Empty,
  ErrorBox,
  Field,
  Logo,
  Modal,
} from "../../components/ui";
import {
  api,
  stepLabels,
  steps,
  resolveSetupStep,
  type Company,
  type WorkspaceData,
} from "../../lib/api";
import { useApp } from "../../lib/context";
import { Overview } from "../companies/Overview";
import { SevenStepOnboarding as Onboarding } from "../onboarding/SevenStepOnboarding";
import { Members } from "../team/Team";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";

export function Workspace({
  overview = false,
  members = false,
  intelligence = false,
}: {
  overview?: boolean;
  members?: boolean;
  intelligence?: boolean;
}) {
  const location = useLocation();
  const moduleName = location.pathname.split("/")[3];
  const shellPath = (path: string) => {
    const params = new URLSearchParams();
    const current = new URLSearchParams(location.search);
    for (const key of ["state", "period"])
      if (current.has(key)) params.set(key, current.get(key)!);
    return path + (params.size ? "?" + params.toString() : "");
  };
  const overviewSelected = ![
    "departments",
    "dependencies",
    "goals",
    "risks",
    "ask",
  ].includes(location.hash.slice(1));
  const [profileOpen, setProfileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false),
    [commandQuery, setCommandQuery] = useState(""),
    [updatesOpen, setUpdatesOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("aynor.sidebar.collapsed") === "true";
    } catch {
      return false;
    }
  });
  const [tooltip, setTooltip] = useState<{
    label: string;
    left: number;
    top: number;
  } | null>(null);
  const [planOpen, setPlanOpen] = useState(false),
    [plan, setPlan] = useState("Basic");
  function hint(label: string) {
    const show = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
      if (!collapsed || innerWidth <= 760) return;
      const r = e.currentTarget.getBoundingClientRect();
      setTooltip({ label, left: r.right + 12, top: r.top + r.height / 2 });
    };
    return {
      onMouseEnter: show,
      onFocus: show,
      onMouseLeave: () => setTooltip(null),
      onBlur: () => setTooltip(null),
    };
  }
  function toggleSidebar() {
    setCollapsed((v) => {
      try {
        if (innerWidth > 760)
          localStorage.setItem("aynor.sidebar.collapsed", String(!v));
      } catch {}
      return !v;
    });
    setTooltip(null);
    setSwitcher(false);
  }
  const { id, step = "departments" } = useParams(),
    nav = useNavigate();
  const [company, setCompany] = useState<Company | null>(null),
    [companies, setCompanies] = useState<Company[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [switcher, setSwitcher] = useState(false),
    [loading, setLoading] = useState(true),
    [help, setHelp] = useState(false);
  const { toast, user } = useApp();
  useEffect(() => {
    const media = matchMedia("(max-width:760px)");
    const resize = () => {
      if (media.matches) setCollapsed(true);
      else {
        try {
          setCollapsed(
            localStorage.getItem("aynor.sidebar.collapsed") === "true",
          );
        } catch {
          setCollapsed(false);
        }
      }
      setTooltip(null);
      setSwitcher(false);
    };
    if (media.matches) resize();
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTooltip(null);
        if (switcher) {
          setSwitcher(false);
          (
            document.querySelector(".company-switcher") as HTMLButtonElement
          )?.focus();
        }
      }
    };
    const outside = (e: globalThis.MouseEvent) => {
      if (!(e.target as Element).closest(".switcher-wrap")) setSwitcher(false);
    };
    window.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
    };
  }, [switcher]);
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem("aynor.plan.preview." + user?.id + "." + id) ||
        "Basic";
      setPlan(["Basic", "Pro", "Premium"].includes(saved) ? saved : "Basic");
    } catch {
      setPlan("Basic");
    }
  }, [id, user?.id]);
  useEffect(() => {
    if (!overview && !members && !intelligence) return;
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (document.querySelector('[role="dialog"]')) return;
        setCommandQuery("");
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [overview, members, intelligence]);
  const workspaceUpdates = [
    ...(!company?.data.completed &&
    company &&
    ["Owner", "Admin"].includes(company.role)
      ? [
          {
            title: "Workspace setup is unfinished",
            detail: "Pick up where you left off.",
            path: `/companies/${id}/onboarding/${company.data.step || "review"}`,
          },
        ]
      : []),
    ...(company?.data.mappings.some((m) => !m.confirmed && !m.ignored) &&
    ["Owner", "Admin"].includes(company.role)
      ? [
          {
            title: "Field mappings need review",
            detail: `${company.data.mappings.filter((m) => !m.confirmed && !m.ignored).length} fields awaiting confirmation.`,
            path: `/companies/${id}/connections`,
          },
        ]
      : []),
  ];
  const searchItems = [
    ...(
      [
        ["Overview", ""],
        ["Departments", "#departments"],
        ["Dependencies", "#dependencies"],
        ["Goals", "#goals"],
        ["Actions", "#risks"],
      ] as const
    ).map(([label, hash]) => ({
      label,
      group: "Go to",
      path: shellPath(
        `/companies/${id}/${hash === "#departments" ? "departments" : hash === "#dependencies" ? "dependencies" : hash === "#goals" ? "goals" : hash === "#risks" ? "actions" : "overview"}`,
      ),
    })),
    ...companies.map((c) => ({
      label: c.name,
      group: "Company",
      path: `/companies/${c.id}/overview`,
    })),
    ...(company?.data.departments || []).map((label) => ({
      label,
      group: "Department",
      path: shellPath(
        `/companies/${id}/departments/${encodeURIComponent(label)}`,
      ),
    })),
    ...(company?.data.goals || []).map((g) => ({
      label: g.name,
      group: "Goal",
      path: shellPath(`/companies/${id}/goals/${g.id}`),
    })),
  ]
    .filter((item) =>
      (item.label + " " + item.group)
        .toLowerCase()
        .includes(commandQuery.trim().toLowerCase()),
    )
    .slice(0, 8);
  function askFromHeader() {
    try {
      sessionStorage.setItem("aynor.ask.pending", commandQuery.trim());
    } catch {}
    setCommandOpen(false);
    nav(
      `/companies/${id}/ask?question=${encodeURIComponent(commandQuery.trim())}&period=${encodeURIComponent(new URLSearchParams(location.search).get("period") || (company ? readPreferences(preferenceKey(user?.id || "guest", company), company).period : "quarter"))}&from=${encodeURIComponent(location.pathname + location.search)}${new URLSearchParams(location.search).has("state") ? "&state=" + encodeURIComponent(new URLSearchParams(location.search).get("state")!) : ""}`,
    );
  }
  async function load() {
    setLoading(true);
    setCompany(null);
    setError("");
    try {
      const [c, cs] = await Promise.all([
        api(`/companies/${id}`),
        api("/companies"),
      ]);
      setCompany(c);
      setCompanies(cs);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  async function save(data: WorkspaceData) {
    if (!company) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api<Company>(`/companies/${id}`, "PATCH", {
        version: company.version,
        data,
      });
      setCompany(updated);
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const editable = !!company && ["Owner", "Admin"].includes(company.role);
  const currentStep = resolveSetupStep(step);
  if (
    !loading &&
    company &&
    company.id === id &&
    currentStep === "complete" &&
    !company.data.completed &&
    !overview &&
    !members &&
    !intelligence
  )
    return <Navigate to={`/companies/${id}/onboarding/review`} replace />;
  const index = steps.indexOf(currentStep);
  const completed = steps.filter(
    (s) => company?.data.steps[s] === "completed",
  ).length;
  if (!overview && !members && !intelligence)
    return (
      <OnboardingFrame
        step={currentStep}
        company={company && company.id === id ? company.name : undefined}
      >
        {loading || (company?.id !== id && !error) ? (
          <div className="onboarding-loading">
            <span className="loading-line" />
            Loading your setup…
          </div>
        ) : !company ? (
          <>
            <ErrorBox>{error}</ErrorBox>
            <Button onClick={load}>Retry</Button>
            <Link className="text-button" to="/companies">
              Your companies
            </Link>
          </>
        ) : !editable ? (
          <Empty
            title="Your workspace is ready to explore"
            description="An Owner or Admin manages company setup."
            action={
              <Link className="button" to={`/companies/${id}/overview`}>
                Open workspace
              </Link>
            }
          />
        ) : (
          <>
            {error && (
              <>
                <ErrorBox>{error}</ErrorBox>
                <Button variant="text" onClick={load}>
                  Reload current workspace
                </Button>
              </>
            )}
            <Onboarding
              key={currentStep + company.id}
              company={company}
              step={currentStep}
              save={save}
              busy={busy}
              onReload={load}
            />
          </>
        )}
      </OnboardingFrame>
    );
  return (
    <div
      className={`workspace-shell refined-shell ${collapsed ? "sidebar-collapsed" : ""}`}
    >
      <aside className="workspace-sidebar">
        <div className="sidebar-brand-row">
          <Link
            className="sidebar-logo"
            to="/companies"
            aria-label="Aynor companies"
          >
            <Logo />
          </Link>
          <button
            className="sidebar-collapse"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
        <div className="switcher-wrap">
          <button
            className="company-switcher"
            aria-label={`Switch company: ${company?.name || "Workspace"}`}
            {...hint(company?.name || "Switch company")}
            aria-expanded={switcher}
            onClick={() => {
              setTooltip(null);
              setSwitcher(!switcher);
            }}
          >
            <span className="company-initial small">
              {company?.name.slice(0, 2).toUpperCase() || "…"}
            </span>
            <span>
              <strong title={company?.name}>
                {company?.name || "Workspace"}
              </strong>
            </span>
            <ChevronDown size={15} />
          </button>
          {switcher && (
            <div className="switcher-menu">
              {companies.map((c) => (
                <Link
                  key={c.id}
                  onClick={() => setSwitcher(false)}
                  to={`/companies/${c.id}/overview`}
                >
                  <span>
                    {c.name}
                    <small>{c.role}</small>
                  </span>
                  {c.id === id && <Check size={14} />}
                </Link>
              ))}
              <Link to="/companies/new">
                <Plus size={15} /> Add company
              </Link>
              <Link to="/companies">
                Manage companies <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </div>
        <nav className="primary-nav" aria-label="Main navigation">
          <Link
            className={overview && overviewSelected ? "active" : ""}
            to={`/companies/${id}/overview`}
            aria-label="Overview"
            data-tooltip="Overview"
            {...hint("Overview")}
            aria-current={overview && overviewSelected ? "page" : undefined}
          >
            <LayoutDashboard size={18} />
            <span className="nav-label">Overview</span>
          </Link>
          {[
            ["departments", "Departments", Building2],
            ["dependencies", "Dependencies", Network],
            ["goals", "Goals", Target],
            ["risks", "Actions", CircleAlert],
            ["ask", "Ask Aynor", MessageSquare],
            ["connections", "Data connections", Database],
          ].map(([section, label, Icon]) => {
            const I = Icon as typeof Building2;
            return (
              <Link
                key={String(section)}
                aria-label={String(label)}
                {...hint(String(label))}
                aria-current={
                  (intelligence &&
                    moduleName ===
                      (section === "risks" ? "actions" : String(section))) ||
                  (overview && location.hash === "#" + section)
                    ? "page"
                    : undefined
                }
                className={
                  (intelligence &&
                    moduleName ===
                      (section === "risks" ? "actions" : String(section))) ||
                  (overview && location.hash === "#" + section)
                    ? "active"
                    : ""
                }
                to={shellPath(
                  `/companies/${id}/${section === "risks" ? "actions" : String(section)}`,
                )}
              >
                <I size={18} />
                <span className="nav-label">{String(label)}</span>
              </Link>
            );
          })}
        </nav>
        <nav className="workspace-settings-nav" aria-label="Company settings">
          <span className="workspace-nav-label">COMPANY</span>
          {editable && (
            <Link
              className={
                intelligence && moduleName === "settings" ? "active" : ""
              }
              to={shellPath(`/companies/${id}/settings/profile`)}
              aria-label="Company settings"
              {...hint("Company settings")}
            >
              <Settings2 size={18} />
              <span className="nav-label">Company settings</span>
            </Link>
          )}
          {editable && (
            <Link
              {...hint("Workspace setup")}
              aria-label="Workspace setup"
              className={!overview && !members && !intelligence ? "active" : ""}
              to={`/companies/${id}/onboarding/${company?.data.step || "departments"}`}
            >
              <Compass size={18} />
              <span className="nav-label">Workspace setup</span>
              <span className="nav-count">
                {completed}/{steps.length - 1}
              </span>
            </Link>
          )}
          {editable && (
            <Link
              {...hint("Team & permissions")}
              aria-label="Team & permissions"
              aria-current={members ? "page" : undefined}
              className={members ? "active" : ""}
              to={`/companies/${id}/settings/members`}
            >
              <Users size={18} />
              <span className="nav-label">Team & permissions</span>
            </Link>
          )}
        </nav>
        {!overview && !members && !intelligence && editable && (
          <div className="setup-nav">
            <div className="sidebar-section-label">
              MAKE IT YOURS <span>{Math.min(index + 1, 12)} / 12</span>
            </div>
            {steps.map((s, i) => (
              <Link
                key={s}
                className={
                  (step === s ? "current " : "") +
                  (company?.data.steps?.[s] === "completed" ? "done" : "")
                }
                to={`/companies/${id}/onboarding/${s}`}
              >
                <span className="step-circle">
                  {company?.data.steps?.[s] === "completed" ? (
                    <Check size={11} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                {stepLabels[i]}
                {company?.data.steps?.[s] === "skipped" && (
                  <small>Skipped</small>
                )}
              </Link>
            ))}
          </div>
        )}
        <div className="sidebar-account">
          <button
            className="sidebar-account-profile"
            aria-label="Account and subscription"
            {...hint(
              `${user?.name || "Account"} · ${company?.role || "Member"} · ${plan}`,
            )}
            onClick={() => setProfileOpen(true)}
          >
            <span className="avatar">
              {user?.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("") || "A"}
            </span>
            <span className="sidebar-account-copy">
              <strong title={user?.name}>{user?.name || "Your account"}</strong>
              <small>
                {company?.role || "Member"}
                <span className="account-inline-dot"> · </span>
                <span className="sidebar-plan-badge">{plan}</span> plan
              </small>
            </span>
            <ChevronDown size={14} />
          </button>
          <button
            className="sidebar-plan-upgrade"
            aria-label={plan === "Premium" ? "Manage plan" : "Upgrade plan"}
            {...hint(plan === "Premium" ? "Manage plan" : "Upgrade plan")}
            onClick={() => setPlanOpen(true)}
          >
            <Sparkles size={16} />
          </button>
        </div>
        <SignOutButton compact={collapsed} className="sidebar-sign-out" />
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div className="workspace-identity">
            <span title={company?.name}>{company?.name || "Workspace"}</span>
            <small>Workspace</small>
          </div>
          <button
            className="header-command"
            aria-label="Search or Ask Aynor"
            aria-keyshortcuts="Control+k Meta+k"
            onClick={() => {
              setCommandQuery("");
              setCommandOpen(true);
            }}
          >
            <Search size={16} />
            <span>Search or ask Aynor</span>
            <kbd>{/Mac/.test(navigator.platform) ? "⌘ K" : "Ctrl K"}</kbd>
          </button>
          <div>
            {!serverMode &&
              (overview || intelligence) &&
              (new URLSearchParams(location.search).get("state")
                ? new URLSearchParams(location.search).get("state") !==
                  "workspace"
                : company && usesExampleData(company)) && (
                <span
                  className="workspace-example-label"
                  title="Illustrative business data; not live company performance."
                >
                  Demo
                </span>
              )}
            <button
              className="header-updates"
              aria-label="Workspace notifications"
              onClick={() => setUpdatesOpen(true)}
            >
              <Bell size={17} />
              {workspaceUpdates.length > 0 && <i />}
            </button>
            <button
              className="workspace-profile"
              onClick={() => setProfileOpen(true)}
              aria-label="Open profile"
            >
              <span className="avatar">
                {user?.name
                  .split(" ")
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join("") || "A"}
              </span>
              <ChevronDown size={13} />
            </button>
          </div>
        </header>
        {loading || (company?.id !== id && !error) ? (
          <div className="workspace-loading">
            <div className="workspace-loading-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span role="status">Loading workspace…</span>
          </div>
        ) : !company ? (
          <div className="workspace-content">
            <ErrorBox>{error}</ErrorBox>
            <Button onClick={load}>Retry</Button>
            <Link to="/companies">Return to companies</Link>
          </div>
        ) : (
          <main className="workspace-content" key={company.id}>
            {error && (
              <>
                <ErrorBox>{error}</ErrorBox>
                <Button variant="text" onClick={load}>
                  Reload current workspace
                </Button>
              </>
            )}
            {intelligence ? (
              <Intelligence
                company={company}
                save={save}
                updateCompany={setCompany}
              />
            ) : overview ? (
              serverMode ? (
                <LiveOverview key={company.id} company={company} />
              ) : (
                <Overview company={company} save={save} />
              )
            ) : members ? (
              <Members company={company} />
            ) : !editable ? (
              <Empty
                title="Your workspace is ready to explore"
                description="An Owner or Admin manages onboarding. Your current role gives you access to the overview."
                action={
                  <Link className="button" to={`/companies/${id}/overview`}>
                    Open overview
                  </Link>
                }
              />
            ) : (
              <Onboarding
                key={currentStep + company.id}
                company={company}
                step={currentStep}
                save={save}
                busy={busy}
                onReload={load}
              />
            )}
          </main>
        )}
        <footer className="workspace-footer">
          <span>AYNOR · A CLEARER PERSPECTIVE</span>
          <span>
            <LockKeyhole size={11} /> Private workspace
          </span>
        </footer>
      </div>
      {commandOpen && (
        <Modal
          title="Search your workspace"
          onClose={() => setCommandOpen(false)}
        >
          <div className="shell-command-panel">
            <Field
              label="Search"
              placeholder="Companies, departments, goals…"
              value={commandQuery}
              onChange={(e) => setCommandQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  document
                    .querySelector<HTMLButtonElement>(
                      ".shell-command-results button",
                    )
                    ?.focus();
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey || !searchItems.length) askFromHeader();
                  else {
                    setCommandOpen(false);
                    nav(searchItems[0].path);
                  }
                }
              }}
            />
            <div className="shell-command-results">
              {searchItems.map((item, i) => (
                <button
                  key={item.group + item.path + i}
                  onClick={() => {
                    setCommandOpen(false);
                    nav(item.path);
                  }}
                >
                  <Search size={14} />
                  <span>{item.label}</span>
                  <small>{item.group}</small>
                  <ArrowUpRight size={13} />
                </button>
              ))}
              {!searchItems.length && <p>No matching records.</p>}
            </div>
            <button className="shell-command-ask" onClick={askFromHeader}>
              <Sparkles size={16} />
              <span>
                {commandQuery.trim()
                  ? `Ask Aynor: ${commandQuery.trim()}`
                  : "Ask Aynor about this workspace"}
              </span>
              <ArrowUpRight size={14} />
            </button>
          </div>
        </Modal>
      )}
      {updatesOpen && (
        <Modal title="Workspace updates" onClose={() => setUpdatesOpen(false)}>
          <div className="shell-command-results">
            {workspaceUpdates.length ? (
              workspaceUpdates.map((update) => (
                <button
                  key={update.path}
                  onClick={() => {
                    setUpdatesOpen(false);
                    nav(update.path);
                  }}
                >
                  <CircleAlert size={16} />
                  <span>
                    {update.title}
                    <small>{update.detail}</small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))
            ) : (
              <p>
                No new updates. Workspace notices will appear here when
                something needs your attention.
              </p>
            )}
          </div>
        </Modal>
      )}
      {tooltip &&
        createPortal(
          <div
            role="tooltip"
            className="shell-tooltip"
            style={{ left: tooltip.left, top: tooltip.top }}
          >
            {tooltip.label}
          </div>,
          document.body,
        )}
      {planOpen && (
        <Modal title="Your subscription" onClose={() => setPlanOpen(false)}>
          <div className="shell-plans">
            <p>
              Explore plans in this frontend preview. No payment or subscription
              will be created.
            </p>
            {["Basic", "Pro", "Premium"].map((p) => (
              <button
                key={p}
                className={p === plan ? "selected" : ""}
                onClick={() => {
                  setPlan(p);
                  try {
                    localStorage.setItem(
                      "aynor.plan.preview." + user?.id + "." + id,
                      p,
                    );
                  } catch {}
                  toast(`${p} selected for this preview. No billing changes.`);
                }}
                aria-pressed={p === plan}
              >
                <span>
                  <Sparkles size={16} />
                  {p}
                </span>
                <small>
                  {p === plan
                    ? "Selected"
                    : p === "Basic"
                      ? "Essential workspace"
                      : p === "Pro"
                        ? "Team insights"
                        : "Advanced intelligence"}
                </small>
                {p === plan && <Check size={16} />}
              </button>
            ))}
            <Button onClick={() => setPlanOpen(false)}>Done</Button>
          </div>
        </Modal>
      )}
      {profileOpen && (
        <Modal title="Your profile" onClose={() => setProfileOpen(false)}>
          <div className="workspace-profile-details">
            <h3>{user?.name}</h3>
            <p>{user?.email}</p>
            <p>
              {company?.name} · {company?.role}
            </p>
            <p className="profile-plan">{plan} plan</p>
            <button
              className="button secondary"
              onClick={() => {
                setProfileOpen(false);
                setPlanOpen(true);
              }}
            >
              Manage subscription
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setProfileOpen(false);
                setHelp(true);
              }}
            >
              <CircleHelp size={15} /> Help & getting started
            </button>
            <Link
              className="button secondary"
              to="/companies"
              onClick={() => setProfileOpen(false)}
            >
              Manage companies
            </Link>
            <SignOutButton />
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="A clearer path to your workspace"
          onClose={() => setHelp(false)}
        >
          <p>
            Start with departments and priorities. You can skip optional steps,
            enter a limited workspace, and return at any time.
          </p>
          <p>
            {serverMode
              ? "Google Sheets connections and reporting snapshots are stored on the server. Sync checks run on an interval; see Data connections for status and validation errors. Other intelligence modules are not yet connected to this financial source."
              : "In this frontend prototype, connections, email, and sign-in are simulated. Sample sources are always labeled. Your progress stays in this browser so you can resume after refresh."}
          </p>
          <Button
            onClick={() => {
              setHelp(false);
              toast("You can resume setup from the sidebar at any time.");
            }}
          >
            Got it
          </Button>
        </Modal>
      )}
    </div>
  );
}
