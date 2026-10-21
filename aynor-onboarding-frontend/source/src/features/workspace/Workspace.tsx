import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Logo,
  Modal,
} from "../../components/ui";
import { api, type Company, type WorkspaceData } from "../../lib/api";
import { useApp } from "../../lib/context";
import { Overview } from "../companies/Overview";
import { Onboarding } from "../onboarding/Onboarding";
import { Members } from "../team/Team";
import { SetupChecklist } from "../wizard/SetupChecklist";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";

export function Workspace({
  overview = false,
  members = false,
}: {
  overview?: boolean;
  members?: boolean;
}) {
  const { id, step } = useParams(),
    nav = useNavigate();
  const [company, setCompany] = useState<Company | null>(null),
    [companies, setCompanies] = useState<Company[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [switcher, setSwitcher] = useState(false),
    [loading, setLoading] = useState(true),
    [help, setHelp] = useState(false);
  const { toast } = useApp();
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
  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <Link className="sidebar-logo" to="/companies">
          <Logo />
        </Link>
        <div className="switcher-wrap">
          <button
            className="company-switcher"
            aria-expanded={switcher}
            onClick={() => setSwitcher(!switcher)}
          >
            <span className="company-initial small">
              {company?.name.slice(0, 2).toUpperCase() || "…"}
            </span>
            <span>
              <strong>{company?.name || "Workspace"}</strong>
              <small>{company?.role || "Loading…"}</small>
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
        <nav className="primary-nav">
          <Link
            className={overview ? "active" : ""}
            to={`/companies/${id}/overview`}
          >
            <LayoutDashboard size={17} /> Overview
          </Link>
          {editable && (
            <Link
              className={!overview && !members ? "active" : ""}
              to={`/companies/${id}/settings/setup`}
            >
              <Compass size={17} /> Workspace settings{" "}
            </Link>
          )}
          {editable && (
            <Link
              className={members ? "active" : ""}
              to={`/companies/${id}/settings/members`}
            >
              <Users size={17} /> Team & permissions
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <ShieldCheck size={17} />
            <strong>Your business stays yours.</strong>
            <p>
              Separate workspaces.
              <br />
              Thoughtful permissions.
            </p>
          </div>
          <button onClick={() => setHelp(true)}>
            <CircleHelp size={16} /> Help & getting started{" "}
            <ArrowUpRight size={13} />
          </button>
          <Link to="/companies">
            <ArrowLeft size={15} /> All companies
          </Link>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-header">
          <div>
            <span>{company?.name || "Workspace"}</span>
            <ChevronRight size={13} />
            <strong>
              {overview
                ? "Overview"
                : members
                  ? "Team & permissions"
                  : "Workspace settings"}
            </strong>
          </div>
          <div>
            <Badge tone="neutral">Interactive prototype</Badge>
            <span className="avatar">{useApp().user?.name.charAt(0)}</span>
          </div>
        </header>
        {loading || (company?.id !== id && !error) ? (
          <div className="workspace-loading">
            <span className="loading-line" />
            Loading workspace…
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
            {overview ? (
              <Overview company={company} save={save} />
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
            ) : !step ? (
              <SetupChecklist company={company} />
            ) : (
              <Onboarding
                settings
                key={step + company.id}
                company={company}
                step={step}
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
            In this frontend prototype, connections, email, and sign-in are
            simulated. Sample sources are always labeled. Your progress stays in
            this browser so you can resume after refresh.
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
