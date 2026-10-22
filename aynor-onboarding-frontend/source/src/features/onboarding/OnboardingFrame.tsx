import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  Compass,
  FileSpreadsheet,
  Layers3,
  Link2,
  LockKeyhole,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/ui";
import { steps, stepLabels } from "../../lib/api";

const visualCopy: Record<
  string,
  { eyebrow: string; heading: ReactNode; caption: string; scene: string }
> = {
  company: {
    eyebrow: "A PLACE OF YOUR OWN",
    heading: (
      <>
        One workspace.
        <br />
        Your whole perspective.
      </>
    ),
    caption: "A clearer view of every business you lead.",
    scene: "structure",
  },
  departments: {
    eyebrow: "YOUR BUSINESS, CONNECTED",
    heading: (
      <>
        Every team.
        <br />
        One bigger picture.
      </>
    ),
    caption: "Built around the way your company works.",
    scene: "structure",
  },
  priorities: {
    eyebrow: "CLARITY STARTS WITH FOCUS",
    heading: (
      <>
        Less noise.
        <br />
        More of what matters.
      </>
    ),
    caption: "Keep your most important priorities in view.",
    scene: "focus",
  },
  integrations: {
    eyebrow: "BRING THE SIGNALS TOGETHER",
    heading: (
      <>
        Your data.
        <br />A clearer connection.
      </>
    ),
    caption: "The spreadsheets you know. A new perspective.",
    scene: "sheets",
  },
  sources: {
    eyebrow: "THE RIGHT STARTING POINT",
    heading: (
      <>
        Good sources.
        <br />
        Better perspective.
      </>
    ),
    caption: "Choose the information that matters to your business.",
    scene: "sheets",
  },
  discovery: {
    eyebrow: "LOOK A LITTLE DEEPER",
    heading: (
      <>
        Find the patterns.
        <br />
        See the possibilities.
      </>
    ),
    caption: "Making space for the connections beneath the surface.",
    scene: "connections",
  },
  mapping: {
    eyebrow: "CONTEXT CHANGES EVERYTHING",
    heading: (
      <>
        The right meaning.
        <br />A clearer picture.
      </>
    ),
    caption: "Give your business information the context it deserves.",
    scene: "mapping",
  },
  readiness: {
    eyebrow: "CLARITY, WITH CONTEXT",
    heading: (
      <>
        Know what’s ready.
        <br />
        Know what’s next.
      </>
    ),
    caption: "An honest foundation for better decisions.",
    scene: "ready",
  },
  kpis: {
    eyebrow: "MEANINGFUL MEASURES",
    heading: (
      <>
        A little focus.
        <br />A stronger direction.
      </>
    ),
    caption: "Define the measures that matter to your company.",
    scene: "metrics",
  },
  goals: {
    eyebrow: "GIVE AMBITION A DIRECTION",
    heading: (
      <>
        A clear target.
        <br />A confident next step.
      </>
    ),
    caption: "Make room for the progress you want to see.",
    scene: "focus",
  },
  invite: {
    eyebrow: "BETTER DECISIONS, TOGETHER",
    heading: (
      <>
        The right people.
        <br />A shared perspective.
      </>
    ),
    caption: "Bring your team into the bigger picture.",
    scene: "team",
  },
  review: {
    eyebrow: "THE BIGGER PICTURE",
    heading: (
      <>
        Everything connected.
        <br />
        Everything in place.
      </>
    ),
    caption: "A workspace shaped around your business.",
    scene: "ready",
  },
  complete: {
    eyebrow: "A CLEARER BEGINNING",
    heading: (
      <>
        Ready for more.
        <br />
        Ready for Aynor.
      </>
    ),
    caption: "Your next chapter starts with a clearer perspective.",
    scene: "ready",
  },
};
export function OnboardingFrame({
  step,
  company,
  children,
}: {
  step: string;
  company?: string;
  children: ReactNode;
}) {
  const index = step === "company" ? 0 : Math.max(1, steps.indexOf(step) + 1);
  const total = steps.length + 1;
  return (
    <main className="onboarding-canvas">
      <div className="onboarding-frame">
        <section className="onboarding-left">
          <header className="onboarding-brand-header">
            <Link to="/home" aria-label="Aynor home">
              <Logo />
            </Link>
            <span>{company || "YOUR NEW WORKSPACE"}</span>
            <span className="onboarding-prototype">Prototype</span>
          </header>
          <div
            className="onboarding-progress"
            aria-label={`Step ${index + 1} of ${total}: ${step === "company" ? "Company details" : stepLabels[steps.indexOf(step)] || "Workspace setup"}`}
          >
            <div>
              <span>
                {String(index + 1).padStart(2, "0")} / {total}
              </span>
              <strong>
                {step === "company"
                  ? "Company details"
                  : stepLabels[steps.indexOf(step)] || "Workspace setup"}
              </strong>
            </div>
            <div className="onboarding-progress-track">
              <span style={{ width: `${((index + 1) / total) * 100}%` }} />
            </div>
          </div>
          <div className="onboarding-form-content">{children}</div>
          <footer className="onboarding-frame-footer">
            <span>© {new Date().getFullYear()} Aynor</span>
            <span>
              <LockKeyhole size={11} /> Your workspace, at your pace.
            </span>
          </footer>
        </section>
        <OnboardingVisual step={step} />
      </div>
    </main>
  );
}
export function OnboardingVisual({ step }: { step: string }) {
  const copy = visualCopy[step] || visualCopy.company;
  return (
    <aside className={"onboarding-visual visual-" + copy.scene}>
      <div className="onboarding-visual-title">
        <span>{copy.eyebrow}</span>
        <h2>{copy.heading}</h2>
        <p>{copy.caption}</p>
      </div>
      <div className="onboarding-illustration" aria-hidden="true">
        <div className="illustration-halo halo-one" />
        <div className="illustration-halo halo-two" />
        {copy.scene === "structure" && (
          <div className="org-illustration">
            <div className="visual-core">
              <Layers3 size={34} strokeWidth={1.25} />
            </div>
            <div className="org-stem" />
            <div className="org-branches" />
            <div className="org-nodes">
              {[BarChart3, BriefcaseBusiness, Users].map((Icon, i) => (
                <div key={i}>
                  <Icon size={24} strokeWidth={1.4} />
                  <i />
                  <i />
                </div>
              ))}
            </div>
            <div className="org-lower-line" />
          </div>
        )}
        {copy.scene === "sheets" && (
          <div className="sheets-illustration">
            <div className="illustrated-sheet sheet-back">
              <FileSpreadsheet size={23} />
              <div className="sheet-grid">
                {Array.from({ length: 12 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <div className="illustrated-sheet sheet-front">
              <div>
                <span />
                <span />
                <span />
              </div>
              <div className="sheet-grid">
                {Array.from({ length: 15 }, (_, i) => (
                  <i key={i} />
                ))}
              </div>
            </div>
            <div className="sheet-connection">
              <i />
              <Link2 size={20} />
              <i />
            </div>
            <div className="visual-core">
              <Layers3 size={31} strokeWidth={1.4} />
            </div>
          </div>
        )}
        {(copy.scene === "focus" || copy.scene === "connections") && (
          <div
            className={
              "focus-illustration " +
              (copy.scene === "connections" ? "is-connected" : "")
            }
          >
            <div className="focus-ring ring-a" />
            <div className="focus-ring ring-b" />
            <div className="focus-ring ring-c" />
            <div className="visual-core">
              {copy.scene === "focus" ? (
                <Target size={36} strokeWidth={1.15} />
              ) : (
                <Sparkles size={34} strokeWidth={1.3} />
              )}
            </div>
            {[BarChart3, BriefcaseBusiness, Users, Compass].map((Icon, i) => (
              <span className={"focus-signal signal-" + i} key={i}>
                <Icon size={21} strokeWidth={1.4} />
              </span>
            ))}
          </div>
        )}
        {copy.scene === "mapping" && (
          <div className="mapping-illustration">
            {[
              { icon: BarChart3, label: "Finance" },
              { icon: BriefcaseBusiness, label: "Delivery" },
              { icon: Users, label: "People" },
            ].map((r, i) => (
              <div key={i}>
                <span>
                  <i />
                  <i />
                </span>
                <div className="mapping-connection">
                  <i />
                  <ArrowRight size={15} />
                </div>
                <strong>
                  <r.icon size={17} />
                  {r.label}
                </strong>
              </div>
            ))}
          </div>
        )}
        {copy.scene === "metrics" && (
          <div className="metrics-illustration">
            <div className="metrics-card">
              <div>
                <span />
                <span />
              </div>
              <div className="illustration-bars">
                {[32, 48, 39, 62, 51, 80, 72].map((h, i) => (
                  <i key={i} style={{ height: h + "%" }} />
                ))}
              </div>
              <footer>
                <i />
                <i />
                <i />
              </footer>
            </div>
            <div className="metric-chip">
              <BarChart3 size={20} />
              <i />
              <span />
            </div>
          </div>
        )}
        {copy.scene === "team" && (
          <div className="team-illustration">
            <div className="team-orbit" />
            <div className="visual-core">
              <Users size={34} strokeWidth={1.25} />
            </div>
            {["A", "S", "J", "M"].map((letter, i) => (
              <div className={"illustrated-person person-" + i} key={letter}>
                <span>{letter}</span>
                <i />
                <i />
              </div>
            ))}
          </div>
        )}
        {copy.scene === "ready" && (
          <div className="ready-illustration">
            <div className="ready-card">
              <div className="ready-symbol">
                <Check size={36} strokeWidth={1.4} />
              </div>
              <span />
              <span />
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <Check size={13} />
                  <i />
                  <i />
                </div>
              ))}
            </div>
            <div className="ready-glint">
              <Sparkles size={25} strokeWidth={1.15} />
            </div>
          </div>
        )}
      </div>
      <div className="onboarding-visual-bottom">
        <span>CLARITY. CONTEXT. CONFIDENCE.</span>
        <span>
          AYNOR <span>®</span>
        </span>
      </div>
      <span className="illustration-caption">
        ILLUSTRATION · NOT COMPANY DATA
      </span>
    </aside>
  );
}
