import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, ErrorBox, Logo } from "../../components/ui";
import { api, type Company } from "../../lib/api";
export function Entry() {
  const [companies, setCompanies] = useState<Company[] | null>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setCompanies(await api<Company[]>("/companies"));
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
  if (!companies.length) return <Navigate to="/companies/new" replace />;
  const c =
    [...companies]
      .reverse()
      .find((c) => !c.data.completed && ["Owner", "Admin"].includes(c.role)) ||
    companies[0];
  return (
    <Navigate
      to={
        c.data.completed || !["Owner", "Admin"].includes(c.role)
          ? `/companies/${c.id}/overview`
          : `/companies/${c.id}/onboarding/${c.data.step || "departments"}`
      }
      replace
    />
  );
}
