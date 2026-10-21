import { ArrowRight, Building2, Check, Compass } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button, ErrorBox, Logo } from "../../components/ui";
import { api, type Company } from "../../lib/api";
import { wizardUrl } from "./progress";
export function Entry() {
  const [companies, setCompanies] = useState<Company[] | null>(null),
    [pending, setPending] = useState(0),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      const [c, i] = await Promise.all([
        api<Company[]>("/companies"),
        api<any[]>("/invitations"),
      ]);
      setCompanies(c);
      setPending(i.filter((x) => x.expires > Date.now()).length);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  if (error)
    return (
      <div className="boot">
        <Logo />
        <ErrorBox>{error}</ErrorBox>
        <Button onClick={load}>Retry</Button>
      </div>
    );
  if (!companies)
    return (
      <div className="boot">
        <Logo />
        <span className="loading-line" />
      </div>
    );
  if (pending || companies.length > 1)
    return <Navigate to="/companies" replace />;
  if (!companies.length) return <Navigate to="/onboarding/welcome" replace />;
  const c = companies[0];
  if (c.data.completed || !["Owner", "Admin"].includes(c.role))
    return <Navigate to={`/companies/${c.id}/overview`} replace />;
  return (
    <div className="wizard-shell">
      <header className="wizard-header">
        <Logo />
      </header>
      <main className="wizard-welcome">
        <div className="account-icon">
          <Compass size={23} />
        </div>
        <div className="page-kicker">WELCOME BACK</div>
        <h1>Pick up where you left off.</h1>
        <p>Your progress for {c.name} is saved.</p>
        <div className="wizard-welcome-actions">
          <Link className="button" to={wizardUrl(c)}>
            Resume setup <ArrowRight size={16} />
          </Link>
          <Link className="text-button" to={`/companies/${c.id}/overview`}>
            Open workspace
          </Link>
        </div>
      </main>
    </div>
  );
}
export function OnboardingWelcome() {
  return (
    <div className="wizard-shell">
      <header className="wizard-header">
        <Logo />
        <span>YOUR WORKSPACE STARTS HERE</span>
      </header>
      <main className="wizard-welcome">
        <span className="account-icon">
          <Building2 size={23} />
        </span>
        <div className="page-kicker">YOU’RE IN</div>
        <h1>
          Let’s make room
          <br />
          for your business.
        </h1>
        <p>A few essentials, then you’re ready to explore.</p>
        <div className="welcome-steps">
          <span>
            <Check size={14} /> Your company
          </span>
          <span>
            <Check size={14} /> Your data
          </span>
          <span>
            <Check size={14} /> Your people
          </span>
        </div>
        <Link className="button" to="/companies/new">
          Set up your company <ArrowRight size={16} />
        </Link>
      </main>
    </div>
  );
}
