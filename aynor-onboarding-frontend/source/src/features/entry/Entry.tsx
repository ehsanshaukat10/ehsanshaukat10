import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button, ErrorBox, Logo } from "../../components/ui";
import { api, type Company } from "../../lib/api";
import { authenticatedDestination } from "../../../shared/journey.mjs";
export function Entry() {
  const location = useLocation();
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
  return (
    <Navigate
      to={authenticatedDestination(
        companies,
        new URLSearchParams(location.search).get("next") || undefined,
      )}
      replace
    />
  );
}
