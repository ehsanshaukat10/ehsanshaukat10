import {
  ArrowRight,
  ArrowUpRight,
  Mail,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppHeader } from "../../components/AppHeader";
import { Badge, Button, Empty, ErrorBox } from "../../components/ui";
import { api, type Company } from "../../lib/api";
import { useApp } from "../../lib/context";
import { wizardUrl } from "../wizard/progress";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";

export function Companies() {
  const { user, toast } = useApp();
  const [companies, setCompanies] = useState<Company[]>([]),
    [invitations, setInvitations] = useState<any[]>([]),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("Name"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState("");
  const nav = useNavigate();
  async function load() {
    try {
      const [c, i] = await Promise.all([
        api("/companies"),
        api("/invitations"),
      ]);
      setCompanies(c);
      setInvitations(i);
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function respond(id: string, action: string) {
    setBusy(id);
    try {
      const r = await api(`/invitations/${id}/${action}`, "POST");
      if (action === "accept") nav(`/companies/${r.companyId}/overview`);
      else {
        toast("Invitation declined");
        load();
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="companies-page">
        <div className="page-kicker">
          <span className="tiny-blue-dot" /> YOUR BUSINESS, CONNECTED
        </div>
        <div className="page-title-row">
          <div>
            <h1>
              Your companies<span className="accent">.</span>
            </h1>
            <p>Different businesses. One clear perspective.</p>
          </div>
          <Link className="button" to="/companies/new">
            <Plus size={16} /> Create company
          </Link>
        </div>
        {invitations.length > 0 && (
          <section className="invitations-panel">
            <div className="section-line">
              <h3>
                <Mail size={17} /> You’re invited
              </h3>
              <Badge>{invitations.length} pending</Badge>
            </div>
            {invitations.map((i) => (
              <div className="invitation-line" key={i.id}>
                <span className="company-initial">{i.company.charAt(0)}</span>
                <div>
                  <strong>{i.company}</strong>
                  <small>
                    {i.role} ·{" "}
                    {i.expires < Date.now()
                      ? "Expired invitation"
                      : "Join the workspace"}
                  </small>
                </div>
                <Button
                  variant="secondary"
                  busy={busy === i.id}
                  onClick={() => respond(i.id, "decline")}
                >
                  Decline
                </Button>
                <Button
                  busy={busy === i.id}
                  disabled={i.expires < Date.now()}
                  onClick={() => respond(i.id, "accept")}
                >
                  Accept <ArrowRight size={14} />
                </Button>
              </div>
            ))}
          </section>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="list-toolbar">
          <span>
            {companies.length} workspace{companies.length !== 1 ? "s" : ""}
            <span className="subtle"> · Select a company to get started</span>
          </span>
          <div>
            <div className="search-input">
              <Search size={15} />
              <input
                aria-label="Search companies"
                placeholder="Search companies…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Sort companies"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option>Name</option>
              <option>Setup status</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="skeleton-grid">
            {[1, 2, 3].map((x) => (
              <div className="skeleton" key={x} />
            ))}
          </div>
        ) : (
          <div className="company-grid">
            {companies
              .filter((c) =>
                c.name.toLowerCase().includes(search.toLowerCase()),
              )
              .sort((a, b) =>
                sort === "Name"
                  ? a.name.localeCompare(b.name)
                  : Number(a.data.completed) - Number(b.data.completed),
              )
              .map((c) => (
                <article className="company-card" key={c.id}>
                  <div className="company-card-top">
                    <span className="company-initial">
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                    <Badge tone={c.data.completed ? "success" : ""}>
                      {c.data.completed
                        ? "Workspace ready"
                        : "Setup incomplete"}
                    </Badge>
                  </div>
                  <h3>{c.name}</h3>
                  <p>
                    {c.industry} <span>·</span> {c.country}
                  </p>
                  <div className="company-card-bottom">
                    <span>
                      <ShieldCheck size={13} />
                      {c.role}
                    </span>
                    <Link to={`/companies/${c.id}/overview`}>
                      Open workspace <ArrowUpRight size={16} />
                    </Link>
                  </div>
                  {!c.data.completed && ["Owner", "Admin"].includes(c.role) && (
                    <Link className="resume-strip" to={wizardUrl(c)}>
                      Continue setting up <ArrowRight size={14} />
                    </Link>
                  )}
                </article>
              ))}
            <Link className="new-company-card" to="/companies/new">
              <span>
                <Plus size={22} />
              </span>
              <strong>A new perspective.</strong>
              <p>Add another company to your workspace.</p>
              <small>
                Create company <ArrowUpRight size={14} />
              </small>
            </Link>
          </div>
        )}
        {!loading &&
          search &&
          !companies.some((c) =>
            c.name.toLowerCase().includes(search.toLowerCase()),
          ) && (
            <Empty
              title="No matching companies"
              description="Try another name or clear your search."
              action={
                <Button variant="secondary" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              }
            />
          )}
        <div className="companies-foot">
          <ShieldCheck size={15} />
          <p>
            Every company is its own private workspace. Your data stays
            separate.
          </p>
          <span>Welcome back, {user?.name.split(" ")[0]}.</span>
        </div>
      </main>
      <footer className="app-footer">
        <span>© {new Date().getFullYear()} Aynor</span>
        <span>Clarity for every business you lead.</span>
      </footer>
    </div>
  );
}
