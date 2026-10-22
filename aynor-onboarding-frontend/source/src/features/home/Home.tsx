import { ArrowRight, BarChart3, BriefcaseBusiness, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/ui";
import { useApp } from "../../lib/context";
import { BrandPanel } from "../auth/Auth";
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
            <span>EXECUTIVE INTELLIGENCE</span>
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
              Understand your business. Know what matters.
              <br />
              Decide what to do next.
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
            <div className="home-preview-note">
              A local preview. No real account or connection required.
            </div>
          </div>
          <footer className="home-footer">
            <span>© {new Date().getFullYear()} Aynor</span>
            <span>One intelligent workspace for every business you lead.</span>
          </footer>
        </section>
        <BrandPanel />
      </div>
    </main>
  );
}
