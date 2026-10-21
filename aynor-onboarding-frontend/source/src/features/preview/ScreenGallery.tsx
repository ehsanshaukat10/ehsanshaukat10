import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  ChevronDown,
  Compass,
  FileSpreadsheet,
  LayoutGrid,
  Mail,
  Play,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../../components/ui";
import { useApp } from "../../lib/context";
import { prototype } from "../../lib/mockService";

export const screens = [
  {
    name: "Create account",
    description: "A thoughtful first impression.",
    path: "/auth/signup",
    group: "01 · First impressions",
    kind: "auth",
  },
  {
    name: "Sign in",
    description: "A familiar way back.",
    path: "/auth/login",
    group: "01 · First impressions",
    kind: "auth",
  },
  {
    name: "Email verification",
    description: "A quick check. A confident start.",
    path: "/auth/verify",
    group: "01 · First impressions",
    kind: "verify",
  },
  {
    name: "Password recovery",
    description: "A clear path back to your account.",
    path: "/auth/forgot-password",
    group: "01 · First impressions",
    kind: "auth",
  },
  {
    name: "Reset password",
    description: "A fresh start, without friction.",
    path: "/auth/reset-password?token=prototype-reset",
    group: "01 · First impressions",
    kind: "auth",
  },
  {
    name: "Your companies",
    description: "Every business. Its own perspective.",
    path: "/companies",
    group: "02 · Your business, your workspace",
    kind: "companies",
  },
  {
    name: "Create company",
    description: "The essentials, beautifully simple.",
    path: "/companies/new",
    group: "02 · Your business, your workspace",
    kind: "form",
  },
  {
    name: "Company profile",
    description: "The foundations, in focus.",
    path: "/companies/:id/onboarding/company",
    group: "02 · Your business, your workspace",
    kind: "form",
  },
  {
    name: "Departments",
    description: "A structure that reflects your business.",
    path: "/companies/:id/onboarding/departments",
    group: "03 · Build your intelligence",
    kind: "departments",
  },
  {
    name: "Business priorities",
    description: "Make space for what matters most.",
    path: "/companies/:id/onboarding/priorities",
    group: "03 · Build your intelligence",
    kind: "priorities",
  },
  {
    name: "Connect Google Sheets",
    description: "Bring your business signals together.",
    path: "/companies/:id/onboarding/integrations",
    group: "03 · Build your intelligence",
    kind: "integration",
  },
  {
    name: "Choose spreadsheets",
    description: "The right sources. A clearer picture.",
    path: "/companies/:id/onboarding/sources",
    group: "03 · Build your intelligence",
    kind: "sources",
  },
  {
    name: "Data discovery",
    description: "Finding the connections beneath the surface.",
    path: "/companies/:id/onboarding/discovery",
    group: "03 · Build your intelligence",
    kind: "discovery",
  },
  {
    name: "Data mapping",
    description: "Give every field the right meaning.",
    path: "/companies/:id/onboarding/mapping",
    group: "03 · Build your intelligence",
    kind: "mapping",
  },
  {
    name: "Intelligence readiness",
    description: "An honest view of what’s ready.",
    path: "/companies/:id/onboarding/readiness",
    group: "03 · Build your intelligence",
    kind: "readiness",
  },
  {
    name: "Performance metrics",
    description: "Thoughtfully defined measures of success.",
    path: "/companies/:id/onboarding/kpis",
    group: "03 · Build your intelligence",
    kind: "kpis",
  },
  {
    name: "Company goals",
    description: "Give your ambition a clear direction.",
    path: "/companies/:id/onboarding/goals",
    group: "03 · Build your intelligence",
    kind: "goals",
  },
  {
    name: "Invite your team",
    description: "Better decisions start with the right people.",
    path: "/companies/:id/onboarding/invite",
    group: "04 · Better, together",
    kind: "team",
  },
  {
    name: "Accept invitation",
    description: "A warm welcome to a shared perspective.",
    path: "/invite/prototype-invitation",
    group: "04 · Better, together",
    kind: "invitation",
  },
  {
    name: "Members & permissions",
    description: "Thoughtful access for every collaborator.",
    path: "/companies/:id/settings/members",
    group: "04 · Better, together",
    kind: "members",
  },
  {
    name: "Review your workspace",
    description: "Every detail. Everything in its place.",
    path: "/companies/:id/onboarding/review",
    group: "05 · A stronger beginning",
    kind: "review",
  },
  {
    name: "Onboarding complete",
    description: "Make room for better decisions.",
    path: "/companies/:id/onboarding/complete",
    group: "05 · A stronger beginning",
    kind: "complete",
  },
  {
    name: "Workspace overview",
    description: "The beginning of a clearer perspective.",
    path: "/companies/:id/overview",
    group: "05 · A stronger beginning",
    kind: "overview",
  },
];
function Specimen({ kind }: { kind: string }) {
  const auth = ["auth", "verify"].includes(kind);
  return (
    <div className={"screen-specimen specimen-" + kind} aria-hidden="true">
      {auth ? (
        <>
          <div className="specimen-auth-form">
            <span className="specimen-logo" />
            <span className="specimen-heading" />
            <i />
            <i />
            <i />
            <b />
          </div>
          <div className="specimen-brand">
            <span />
            <div>✳</div>
            <i />
            <i />
          </div>
        </>
      ) : (
        <>
          <div className="specimen-sidebar">
            <span />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="specimen-main">
            <span className="specimen-heading" />
            <span className="specimen-subhead" />
            {kind === "departments" ||
            kind === "companies" ||
            kind === "priorities" ? (
              <div className="specimen-tiles">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i}>
                    <span />
                    <i />
                  </div>
                ))}
              </div>
            ) : kind === "complete" ||
              kind === "discovery" ||
              kind === "invitation" ? (
              <div className="specimen-success">
                <span>
                  {kind === "complete" ? (
                    <Check size={20} />
                  ) : kind === "discovery" ? (
                    <Sparkles size={20} />
                  ) : (
                    <Mail size={20} />
                  )}
                </span>
                <i />
                <i />
                <b />
              </div>
            ) : kind === "overview" ? (
              <>
                <div className="specimen-banner" />
                <div className="specimen-tiles">
                  {[1, 2, 3].map((i) => (
                    <div key={i}>
                      <span />
                      <i />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div
                className={
                  "specimen-rows " +
                  (kind === "integration" ? "specimen-integration" : "")
                }
              >
                {[1, 2, 3, 4].map((i) => (
                  <div key={i}>
                    <span />
                    {kind === "readiness" ? <Check size={8} /> : <i />}
                    <b />
                  </div>
                ))}
              </div>
            )}
            <div className="specimen-bottom">
              <i />
              <b />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export function ScreenGallery() {
  const [filter, setFilter] = useState("All screens");
  const { setUser } = useApp();
  const nav = useNavigate();
  function open(path: string) {
    const r = prototype.preview(path);
    setUser(r.user);
    nav(r.path);
  }
  const groups = [...new Set(screens.map((s) => s.group))];
  return (
    <div className="flow-gallery">
      <header className="gallery-header">
        <Logo />
        <span>THE COMPLETE ONBOARDING EXPERIENCE</span>
        <div>
          <span className="gallery-status">
            <i /> Interactive prototype
          </span>
          <span className="gallery-count">23 screens</span>
        </div>
      </header>
      <main className="gallery-main">
        <section className="gallery-hero">
          <div>
            <div className="page-kicker">
              <span className="tiny-blue-dot" /> AYNOR / ONBOARDING DESIGN
            </div>
            <h1>
              A thoughtful start.
              <br />
              <span>A clearer perspective.</span>
            </h1>
            <p>
              The entire journey, from your first hello to a workspace of your
              own.
              <br />
              Explore every screen. Follow every connection. Make it yours.
            </p>
            <div className="gallery-hero-actions">
              <button className="button" onClick={() => open("/companies/new")}>
                <Play size={14} /> Walk through onboarding{" "}
                <ArrowRight size={15} />
              </button>
              <button
                className="button secondary"
                onClick={() => open("/auth/signup")}
              >
                Start with signup <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="gallery-promises">
              <span>
                <CheckCheck size={13} /> All screens connected
              </span>
              <span>
                <Compass size={13} /> Optional setup, resumable
              </span>
              <span>
                <ShieldCheck size={13} /> Frontend prototype
              </span>
            </div>
          </div>
          <div className="gallery-hero-art">
            <div className="hero-art-top">
              <span>
                <Sparkles size={15} /> THE BIGGER PICTURE
              </span>
              <span>01 — 23</span>
            </div>
            <h2>
              From first impression
              <br />
              to your next best move.
            </h2>
            <div className="journey-path">
              {[
                { i: Building2, t: "Your workspace" },
                { i: FileSpreadsheet, t: "Your intelligence" },
                { i: Users, t: "Your people" },
              ].map((n, i) => (
                <div key={n.t}>
                  <span>
                    <n.i size={18} />
                  </span>
                  <strong>{n.t}</strong>
                  <small>
                    {
                      [
                        "A place of your own",
                        "The connections that matter",
                        "A shared perspective",
                      ][i]
                    }
                  </small>
                  {i < 2 && <i />}
                </div>
              ))}
            </div>
            <div className="hero-art-bottom">
              <span>ONE CONNECTED EXPERIENCE</span>
              <span>
                AYNOR <ArrowUpRight size={12} />
              </span>
            </div>
          </div>
        </section>
        <div className="gallery-toolbar">
          <div>
            <LayoutGrid size={16} />
            <strong>Explore the screens</strong>
            <span>{screens.length} designed moments</span>
          </div>
          <select
            aria-label="Filter screen group"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All screens</option>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        {groups
          .filter((g) => filter === "All screens" || g === filter)
          .map((group) => (
            <section className="gallery-section" key={group}>
              <div className="gallery-section-heading">
                <h2>{group}</h2>
                <span>
                  {screens.filter((s) => s.group === group).length} screens
                </span>
              </div>
              <div className="screen-grid">
                {screens
                  .map((s, i) => ({ ...s, index: i }))
                  .filter((s) => s.group === group)
                  .map((s) => (
                    <button
                      key={s.path}
                      className="screen-card"
                      onClick={() => open(s.path)}
                      aria-label={`Open ${s.name} screen`}
                    >
                      <div className="screen-card-visual">
                        <Specimen kind={s.kind} />
                        <span className="screen-card-open">
                          Explore screen <ArrowUpRight size={13} />
                        </span>
                      </div>
                      <div className="screen-card-description">
                        <span className="screen-index">
                          {String(s.index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <h3>{s.name}</h3>
                          <p>{s.description}</p>
                        </div>
                        <ArrowUpRight size={16} />
                      </div>
                    </button>
                  ))}
              </div>
            </section>
          ))}
        <footer className="gallery-footer">
          <Logo />
          <p>
            Understand your business. Know what matters. Decide what to do next.
          </p>
          <span>Original AYNOR design · Simulated interactions</span>
        </footer>
      </main>
    </div>
  );
}
export function FlowNavigator() {
  const loc = useLocation(),
    nav = useNavigate();
  const { setUser } = useApp();
  const [expanded, setExpanded] = useState(false);
  const active =
    sessionStorage.getItem("aynor.screen-preview") === "active" &&
    loc.pathname !== "/prototype";
  const index = screens.findIndex(
    (s) =>
      s.path.split("?")[0].replace(":id", "preview-workspace") === loc.pathname,
  );
  useEffect(() => {
    document.body.classList.toggle("has-flow-preview", active);
    return () => document.body.classList.remove("has-flow-preview");
  }, [active]);
  if (!active) return null;
  function open(i: number) {
    const r = prototype.preview(screens[i].path);
    setUser(r.user);
    nav(r.path);
    setExpanded(false);
  }
  return (
    <div className="flow-navigator">
      <div className="flow-nav-main">
        <Link to="/prototype" className="flow-index-link">
          <LayoutGrid size={15} />
          <span>All 23 screens</span>
        </Link>
        <span className="flow-nav-divider" />
        <button className="flow-current" onClick={() => setExpanded(!expanded)}>
          <span>{String(Math.max(index + 1, 1)).padStart(2, "0")} / 23</span>
          <strong>{screens[index]?.name || "Onboarding journey"}</strong>
          <ChevronDown size={13} />
        </button>
        <div className="flow-nav-arrows">
          <button
            aria-label="Previous preview screen"
            disabled={index <= 0}
            onClick={() => open(index - 1)}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            aria-label="Next preview screen"
            disabled={index >= screens.length - 1}
            onClick={() => open(index + 1)}
          >
            <span>Next screen</span>
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="flow-screen-menu">
          {screens.map((s, i) => (
            <button
              key={s.path}
              className={index === i ? "selected" : ""}
              onClick={() => open(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s.name}
              {index === i && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
