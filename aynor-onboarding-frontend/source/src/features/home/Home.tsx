import { ArrowRight, BarChart3, BriefcaseBusiness, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/ui";
import { useApp } from "../../lib/context";

import { SkipSignIn } from "../entry/SkipSignIn";
export function Home() {
  const { user } = useApp();
  const guest = user?.id === "onboarding-guest";
  return (
    <main className="home-canvas">
      <div className="home-frame">
        <section className="home-left">
          <header className="home-header">
            <Logo />
            <nav className="landing-nav" aria-label="Main navigation">
              <button
                type="button"
                onClick={() =>
                  document
                    .getElementById("perspective")
                    ?.scrollIntoView({
                      behavior: matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                        ? "auto"
                        : "smooth",
                      block: "start",
                    })
                }
              >
                The platform
              </button>
              <Link to="/auth/login">
                Sign in <ArrowRight size={16} />
              </Link>
            </nav>
          </header>
          <div className="home-content">
            <div className="page-kicker">
              <span className="tiny-blue-dot" /> A CLEARER PERSPECTIVE
            </div>
            <h1>
              Your business.
              <br />
              <span>Understood.</span>
            </h1>
            <p>
              One connected perspective on performance, people, and progress.
              Turn the information you already have into your next clear
              decision.
            </p>
            <div className="home-signals">
              <span>
                <BarChart3 size={15} /> Performance
              </span>
              <span>
                <BriefcaseBusiness size={15} /> Delivery
              </span>
              <span>
                <Users size={15} /> People
              </span>
            </div>
            <div className="home-actions">
              {user && !guest ? (
                <Link className="button" to="/entry">
                  Continue to your workspace <ArrowRight size={16} />
                </Link>
              ) : (
                <>
                  <Link className="button" to="/auth/login">
                    Log in <ArrowRight size={16} />
                  </Link>
                  <Link className="button secondary" to="/auth/signup">
                    Create account
                  </Link>
                </>
              )}
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
            <div className="landing-assurance">
              Built around your business. Designed for better decisions.
            </div>
          </div>
          <footer className="home-footer">
            <span>© {new Date().getFullYear()} Aynor</span>
            <span>One intelligent workspace for every business you lead.</span>
          </footer>
        </section>
        <aside
          className="corporate-visual"
          id="perspective"
          aria-label="A connected view of your business"
        >
          <div className="corporate-visual-heading">
            <span>THE EXECUTIVE PERSPECTIVE</span>
            <h2>
              See the whole.
              <br />
              Move with clarity.
            </h2>
            <p>Your teams, priorities and information. In one place.</p>
          </div>
          <div className="corporate-orbit" aria-hidden="true">
            <div className="orbit-line" />
            <div className="orbit-line inner" />
            <div className="corporate-core">
              <Logo />
            </div>
            <div className="corporate-node node-performance">
              <BarChart3 />
              <span>Performance</span>
              <small>A clearer picture</small>
            </div>
            <div className="corporate-node node-people">
              <Users />
              <span>Your people</span>
              <small>A shared direction</small>
            </div>
            <div className="corporate-node node-delivery">
              <BriefcaseBusiness />
              <span>Progress</span>
              <small>Every team, connected</small>
            </div>
          </div>
          <div className="corporate-visual-footer">
            <span>CLARITY AT EVERY LEVEL.</span>
            <span>01 — AYNOR</span>
          </div>
        </aside>
      </div>
    </main>
  );
}
