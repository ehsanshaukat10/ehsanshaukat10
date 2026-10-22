import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Layers3,
  Link2,
  Menu,
  Target,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/ui";
import { useApp } from "../../lib/context";
import { SkipSignIn } from "../entry/SkipSignIn";
import "./landing.css";

const features = [
  {
    icon: BarChart3,
    number: "01",
    title: "See beyond the numbers.",
    text: "Bring your key measures into one perspective. Keep the performance that matters close to the decisions you make.",
    label: "PERFORMANCE, IN PERSPECTIVE",
    large: true,
  },
  {
    icon: Users,
    number: "02",
    title: "A shared direction.",
    text: "Connect teams around the same priorities, with access shaped around their responsibilities.",
    label: "PEOPLE & DEPARTMENTS",
  },
  {
    icon: Target,
    number: "03",
    title: "Make progress intentional.",
    text: "Give every goal a clear measure, an owner, and a next step.",
    label: "GOALS & PRIORITIES",
  },
];
const plans = [
  {
    name: "Essential",
    audience: "A clearer starting point.",
    text: "For a team bringing its information and priorities together.",
    items: [
      "A focused company workspace",
      "Departments and business priorities",
      "Source mapping and core KPIs",
    ],
    cta: "Explore Essential",
  },
  {
    name: "Growth",
    audience: "A bigger perspective.",
    text: "For growing businesses connecting people, performance, and progress.",
    items: [
      "Everything in Essential",
      "Team roles and department access",
      "Goals and shared performance tracking",
    ],
    cta: "Explore Growth",
    featured: true,
  },
  {
    name: "Enterprise",
    audience: "Room for your ambition.",
    text: "For leaders shaping a connected view across multiple companies.",
    items: [
      "Everything in Growth",
      "Multiple company workspaces",
      "A setup tailored to your organisation",
    ],
    cta: "Explore Enterprise",
  },
];
const questions = [
  [
    "What is AYNOR?",
    "AYNOR brings company information, business priorities, teams, and performance measures into one connected workspace. Start by shaping the workspace around your business.",
  ],
  [
    "Do I need to connect my data immediately?",
    "No. You can set up your company and departments first, skip optional steps, and return to connect sources and refine mappings later.",
  ],
  [
    "Can I manage more than one company?",
    "Yes. Each company has its own workspace, setup progress, team, and priorities. Use the company switcher to move between them.",
  ],
  [
    "Can I explore before creating an account?",
    "Yes. Choose Skip for now to explore the onboarding journey as a guest. No payment is required.",
  ],
];
function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start",
  });
}
export function Home() {
  const { user } = useApp();
  const guest = user?.id === "onboarding-guest";
  const [menu, setMenu] = useState(false);
  const destination = user && !guest ? "/entry" : "/auth/signup";
  return (
    <main className="aynor-landing">
      <header className="lp-header">
        <Link to="/home" aria-label="Aynor home">
          <Logo />
        </Link>
        <nav
          className={menu ? "lp-nav is-open" : "lp-nav"}
          aria-label="Main navigation"
        >
          {[
            ["Features", "features"],
            ["How it works", "how-it-works"],
            ["Pricing", "pricing"],
          ].map(([label, id]) => (
            <button
              key={id}
              onClick={() => {
                scrollToSection(id);
                setMenu(false);
              }}
            >
              {label}
            </button>
          ))}
          <Link className="lp-button lp-nav-cta" to={destination}>
            Sign up <ArrowRight size={16} />
          </Link>
          <Link to="/auth/login">Log in</Link>
        </nav>
        <button
          className="lp-menu"
          onClick={() => setMenu(!menu)}
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>

      <section className="lp-hero">
        <div className="lp-eyebrow">
          <span /> THE EXECUTIVE PERSPECTIVE
        </div>
        <h1>
          See clearly.
          <br />
          <span>Lead confidently.</span>
        </h1>
        <p>
          One connected perspective on performance, people, and progress.
          <br className="lp-desktop-break" /> See what matters. Move forward
          with clarity.
        </p>
        <div className="lp-hero-actions">
          <Link className="lp-button" to={destination}>
            {user && !guest ? "Continue to your workspace" : "Create account"}{" "}
            <ArrowRight size={17} />
          </Link>
          <button
            className="lp-button lp-button-light"
            onClick={() => scrollToSection("features")}
          >
            Explore the platform <ArrowDown size={17} />
          </button>
        </div>
        {(!user || guest) && (
          <SkipSignIn
            label={
              guest
                ? "Continue guest onboarding"
                : "Skip for now · explore onboarding"
            }
          />
        )}
        <div
          className="lp-product-scene"
          aria-label="Illustration of a connected business workspace"
        >
          <div className="lp-scene-label">
            <span>
              <Layers3 size={17} /> YOUR BUSINESS, CONNECTED
            </span>
            <span>
              A clearer perspective <span className="lp-live-dot" />
            </span>
          </div>
          <div className="lp-scene-grid">
            <div className="lp-scene-intro">
              <span className="lp-eyebrow">THE BIGGER PICTURE</span>
              <h2>
                Clarity at
                <br />
                every level.
              </h2>
              <p>
                Everything that matters.
                <br />
                One shared direction.
              </p>
              <div className="lp-scene-brand">
                <Logo />
              </div>
            </div>
            <div className="lp-scene-cards">
              <article className="lp-scene-performance">
                <div className="lp-card-title">
                  <BarChart3 size={20} />
                  <span>Performance</span>
                  <span>01</span>
                </div>
                <h3>
                  A clearer view.
                  <br />A confident next step.
                </h3>
                <div className="lp-chart" aria-hidden="true">
                  {[28, 45, 35, 61, 50, 76, 68, 90, 82, 100].map((h, i) => (
                    <i key={i} style={{ height: `${h}%` }} />
                  ))}
                </div>
                <small>From information to perspective.</small>
              </article>
              <div className="lp-scene-bottom">
                <article>
                  <Users size={22} />
                  <h3>People, aligned.</h3>
                  <p>
                    Every team.
                    <br />
                    One bigger picture.
                  </p>
                  <div className="lp-avatar-stack" aria-hidden="true">
                    <span>AF</span>
                    <span>JL</span>
                    <span>SK</span>
                    <span>+</span>
                  </div>
                </article>
                <article>
                  <Target size={22} />
                  <h3>Focus, defined.</h3>
                  <p>
                    Priorities that turn
                    <br />
                    ambition into direction.
                  </p>
                  <span className="lp-focus-pill">
                    <Check size={14} /> A shared next step
                  </span>
                </article>
              </div>
            </div>
          </div>
        </div>
        <div className="lp-capabilities">
          <span>BUILT FOR A CONNECTED BUSINESS</span>
          <div>
            <span>
              <BarChart3 /> Performance
            </span>
            <span>
              <BriefcaseBusiness /> Delivery
            </span>
            <span>
              <Users /> People
            </span>
            <span>
              <Target /> Direction
            </span>
          </div>
        </div>
      </section>

      <section className="lp-section lp-features" id="features">
        <div className="lp-section-heading">
          <div>
            <span className="lp-eyebrow">
              LESS FRAGMENTATION. MORE PERSPECTIVE.
            </span>
            <h2>
              The whole picture.
              <br />
              <span>Finally, in focus.</span>
            </h2>
          </div>
          <p>
            Good decisions start with context. Bring the right information and
            the right people together, without adding to the noise.
          </p>
        </div>
        <div className="lp-feature-grid">
          {features.map((f) => (
            <article
              className={
                f.large
                  ? "lp-feature-card lp-feature-primary"
                  : "lp-feature-card"
              }
              key={f.number}
            >
              <div className="lp-feature-top">
                <f.icon size={26} strokeWidth={1.5} />
                <span>{f.number}</span>
              </div>
              <div className="lp-feature-copy">
                <span className="lp-eyebrow">{f.label}</span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
              {f.large && (
                <div className="lp-feature-lines" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="lp-process" id="how-it-works">
        <div className="lp-section-heading">
          <div>
            <span className="lp-eyebrow">A THOUGHTFUL START</span>
            <h2>
              Built around you.
              <br />
              <span>From the first step.</span>
            </h2>
          </div>
          <p>
            Your business has its own way of working. Your workspace should
            reflect it.
          </p>
        </div>
        <div className="lp-process-grid">
          {[
            {
              n: "01",
              icon: BriefcaseBusiness,
              title: "Make it your own.",
              text: "Create your company workspace. Choose your departments and what matters most.",
            },
            {
              n: "02",
              icon: Link2,
              title: "Connect the context.",
              text: "Choose your sources, review your mappings, and define meaningful measures.",
            },
            {
              n: "03",
              icon: Users,
              title: "Move forward, together.",
              text: "Invite your people, set your goals, and bring your business into one perspective.",
            },
          ].map((s) => (
            <article key={s.n}>
              <div>
                <span>{s.n}</span>
                <s.icon size={24} />
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-pricing" id="pricing">
        <div className="lp-pricing-heading">
          <span className="lp-eyebrow">ROOM TO GROW</span>
          <h2>
            Your next stage.
            <br />
            <span>Your kind of workspace.</span>
          </h2>
          <p>Explore the plan that fits the way your business works.</p>
        </div>
        <div className="lp-pricing-grid">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={plan.featured ? "lp-plan lp-plan-featured" : "lp-plan"}
            >
              <div className="lp-plan-label">
                <span>{plan.name}</span>
                {plan.featured && <small>FOR GROWING TEAMS</small>}
              </div>
              <h3>{plan.audience}</h3>
              <p>{plan.text}</p>
              <div className="lp-plan-price">
                Let’s find your fit.
                <small>Plan pricing available before purchase.</small>
              </div>
              <Link
                className={
                  plan.featured ? "lp-button" : "lp-button lp-button-light"
                }
                to={`${destination}${destination === "/auth/signup" ? `?plan=${plan.name.toLowerCase()}` : ""}`}
              >
                {plan.cta}
                <ArrowRight size={16} />
              </Link>
              <ul>
                {plan.items.map((item) => (
                  <li key={item}>
                    <Check size={17} />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="lp-pricing-note">
          Explore without payment. Plan options are illustrative; pricing and
          availability will be confirmed before purchase.
        </p>
      </section>

      <section className="lp-section lp-faq" id="questions">
        <div>
          <span className="lp-eyebrow">A LITTLE MORE CONTEXT</span>
          <h2>
            Good questions.
            <br />
            <span>Clear answers.</span>
          </h2>
        </div>
        <div>
          {questions.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <ChevronDown size={19} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="lp-closing">
        <span className="lp-eyebrow">YOUR NEXT CHAPTER</span>
        <h2>
          A clearer perspective.
          <br />
          Starts here.
        </h2>
        <p>Make space for the business you’re building.</p>
        <Link className="lp-button" to={destination}>
          Get started with AYNOR <ArrowRight size={18} />
        </Link>
      </section>
      <footer className="lp-footer">
        <div className="lp-footer-top">
          <div>
            <Logo />
            <p>
              Clarity. Context. Confidence.
              <br />
              One intelligent workspace for every business you lead.
            </p>
          </div>
          <div>
            <span>THE PLATFORM</span>
            <button onClick={() => scrollToSection("features")}>
              Features
            </button>
            <button onClick={() => scrollToSection("how-it-works")}>
              How it works
            </button>
            <button onClick={() => scrollToSection("pricing")}>Pricing</button>
          </div>
          <div>
            <span>YOUR NEXT STEP</span>
            <Link to="/auth/login">Sign in</Link>
            <Link to={destination}>Create your workspace</Link>
            <button onClick={() => scrollToSection("questions")}>
              Questions & answers
            </button>
          </div>
        </div>
        <div className="lp-footer-bottom">
          <span>© {new Date().getFullYear()} AYNOR. All rights reserved.</span>
          <button
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
              })
            }
          >
            Back to top ↑
          </button>
        </div>
      </footer>
    </main>
  );
}
