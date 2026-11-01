import { useLocation, useSearchParams, Link } from "react-router-dom";
import type { Company } from "../../lib/api";
import { Button, ErrorBox } from "../../components/ui";
import { ModulePage } from "../intelligence/shared";
import { useCompanyIntelligence } from "./useCompanyIntelligence";
import {
  businessLink,
  moduleReturn,
  connectionsLink,
} from "./dashboard-navigation";
import type { ReactNode } from "react";
export function useGovernedModule(company: Company, routeDepartment?: string) {
  const location = useLocation(),
    [urlQuery, setQuery] = useSearchParams();
  const query = new URLSearchParams(urlQuery);
  if (routeDepartment) query.set("department", routeDepartment);
  const state = useCompanyIntelligence(company, query.toString());
  const base = `/companies/${company.id}`,
    origin = location.pathname + location.search;
  return {
    ...state,
    company,
    routeDepartment,
    query,
    setQuery,
    base,
    origin,
    link: (target: string, from?: string) =>
      connectionsLink(
        company.id,
        businessLink(company.id, target, query.toString(), from),
        origin,
      ),
    back: moduleReturn(company.id, query.get("from")),
    change: (key: string, value: string) => {
      const next = new URLSearchParams(query);
      if (value) next.set(key, value);
      else next.delete(key);
      setQuery(next);
    },
  };
}
export function GovernedModule({
  title,
  description,
  module,
  back,
  actions,
  children,
}: {
  title: string;
  description?: string;
  module: ReturnType<typeof useGovernedModule>;
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const m = module;
  return (
    <ModulePage
      title={title}
      description={description}
      exec={{
        period: m.query.get("period") || "month",
        changePeriod: (p) => m.change("period", p),
        error: "",
        reload: m.retry,
      }}
      governed
      showPeriod={false}
      back={back}
      actions={actions}
    >
      <ErrorBox>{m.error}</ErrorBox>
      {m.error && (
        <>
          <p>
            {m.report
              ? "Showing the last authorized saved report."
              : "Reporting is unavailable."}
          </p>
          <Button variant="secondary" onClick={m.retry}>
            Retry report
          </Button>
        </>
      )}
      {m.busy && (
        <p role="status">
          {m.report
            ? "Updating report…"
            : "Loading authorized business reporting…"}
        </p>
      )}
      {m.report && (
        <>
          <div className="intel-toolbar">
            <select
              aria-label="Reporting scope"
              value={m.query.get("scope") || ""}
              onChange={(e) => m.change("scope", e.target.value)}
            >
              <option value="">All authorized reporting scopes</option>
              {m.report.scopes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.currency ? ` · ${s.currency}` : ""}
                </option>
              ))}
            </select>
            {!m.routeDepartment && (
              <select
                aria-label="Department filter"
                value={m.query.get("department") || ""}
                onChange={(e) => {
                  const next = new URLSearchParams(m.query);
                  next.delete("scope");
                  if (e.target.value) next.set("department", e.target.value);
                  else next.delete("department");
                  m.setQuery(next);
                }}
              >
                <option value="">All authorized departments</option>
                {m.report.departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            )}
          </div>
          {children}
        </>
      )}
    </ModulePage>
  );
}
export function EvidenceLink({
  companyId,
  href,
  search,
  origin,
}: {
  companyId: string;
  href: string;
  search: string;
  origin: string;
}) {
  return (
    <Link to={businessLink(companyId, href, search, origin)}>
      Investigate evidence
    </Link>
  );
}
