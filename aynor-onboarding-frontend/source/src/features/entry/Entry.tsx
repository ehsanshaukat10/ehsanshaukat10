import { ArrowRight, Compass } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button, ErrorBox, Logo } from "../../components/ui";
import { api, type Company } from "../../lib/api";
import { OnboardingFrame } from "../onboarding/OnboardingFrame";
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
  if (!companies.length) return <Navigate to="/companies/new" replace />;
  const c = companies[0];
  if (c.data.completed || !["Owner", "Admin"].includes(c.role))
    return <Navigate to={`/companies/${c.id}/overview`} replace />;
  return (
    <OnboardingFrame step={c.data.step || "departments"} company={c.name}>
      <div className="resume-content">
        <span className="account-icon">
          <Compass size={22} />
        </span>
        <h1>
          A little more clarity
          <br />
          is just ahead.
        </h1>
        <p>Your progress for {c.name} is saved.</p>
        <Link
          className="button"
          to={`/companies/${c.id}/onboarding/${c.data.step || "departments"}`}
        >
          Resume setup <ArrowRight size={16} />
        </Link>
        <Link className="text-button" to={`/companies/${c.id}/overview`}>
          Open workspace
        </Link>
      </div>
    </OnboardingFrame>
  );
}
