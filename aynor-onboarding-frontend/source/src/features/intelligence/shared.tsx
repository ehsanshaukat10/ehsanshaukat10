import { serverMode } from "../../lib/runtime";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  Database,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button, ErrorBox, Modal } from "../../components/ui";
import type { Company, WorkspaceData } from "../../lib/api";
import { useApp } from "../../lib/context";
import {
  buildSample,
  inferProfile,
  periods,
  preferenceKey,
  readPreferences,
  usesExampleData,
  type Period,
  type Scenario,
  type Preferences,
} from "../dashboard/model";
export type ModuleProps = {
  company: Company;
  save: (data: WorkspaceData) => Promise<boolean | undefined>;
  updateCompany: (company: Company) => void;
};
export type GoalMeta = {
  department: string;
  period?: Period;
  tracking: "Manual" | "Connected";
  metric: string;
  baseline?: number;
  direction: "Increase" | "Decrease";
  status: "Active" | "Paused" | "Archived";
  history: { value: number; date: string }[];
};
export type ActionState = {
  status:
    "Recommended" | "Accepted" | "In Progress" | "Completed" | "Dismissed";
  reason?: string;
  note?: string;
  at: string;
  fingerprint: string;
  snapshot: {
    title: string;
    impact: string;
    department: string;
    severity: string;
    action: string;
    evidence: string[];
  };
};
export type Message = {
  id: string;
  question: string;
  answer: string;
  evidence: string[];
  links: { label: string; path: string }[];
  status: "complete" | "error";
  date: string;
};
export type Conversation = {
  id: string;
  title: string;
  context?: string;
  origin?: string;
  period: Period;
  access?: string;
  messages: Message[];
};
export type LocalState = {
  goals: Record<string, GoalMeta>;
  actions: Record<string, ActionState>;
  conversations: Conversation[];
  sync: Record<string, string>;
};
const initial = (): LocalState => ({
  goals: {},
  actions: {},
  conversations: [],
  sync: {},
});
export const localKey = (user: string, company: string) =>
  `aynor.intelligence.v1.${user}.${company}`;
export function useLocalState(company: Company) {
  const failOnce = useRef(false),
    route = useLocation();
  const { user, toast } = useApp(),
    key = localKey(user?.id || "guest", company.id);
  const loadIssue = useRef("");
  const read = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw Error();
      const next = { ...initial(), ...parsed } as LocalState;
      if (
        !next.goals ||
        !next.actions ||
        !next.sync ||
        !Array.isArray(next.conversations)
      )
        throw Error();
      if (
        Object.values(next.goals).some((g) => !g || !Array.isArray(g.history))
      )
        throw Error();
      if (
        Object.values(next.actions).some(
          (a) => !a?.snapshot || !Array.isArray(a.snapshot.evidence),
        )
      )
        throw Error();
      if (
        next.conversations.some(
          (t) =>
            !t ||
            !Array.isArray(t.messages) ||
            t.messages.some(
              (m) =>
                !m || !Array.isArray(m.evidence) || !Array.isArray(m.links),
            ),
        )
      )
        throw Error();
      loadIssue.current = "";
      return next;
    } catch {
      loadIssue.current =
        "Couldn't load saved local workspace records. Retry before recording new decisions.";
      return initial();
    }
  };
  const [state, setState] = useState<LocalState>(read),
    [error, setError] = useState(loadIssue.current),
    [busy, setBusy] = useState(false);
  const reload = () => {
    const next = read();
    if (loadIssue.current) setError(loadIssue.current);
    else {
      setState(next);
      setError("");
    }
  };
  useEffect(() => {
    window.addEventListener("aynor:local-change", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("aynor:local-change", reload);
      window.removeEventListener("storage", reload);
    };
  }, [key]);
  async function commit(next: LocalState, message: string) {
    if (busy || loadIssue.current) {
      if (loadIssue.current) setError(loadIssue.current);
      return false;
    }
    setBusy(true);
    setError("");
    try {
      await new Promise((r) => setTimeout(r, 180));
      if (
        new URLSearchParams(route.search).get("write") === "error" &&
        !failOnce.current
      ) {
        failOnce.current = true;
        throw Error("Storage is unavailable in this preview state.");
      }
      localStorage.setItem(key, JSON.stringify(next));
      setState(next);
      window.dispatchEvent(new Event("aynor:local-change"));
      toast(message);
      return true;
    } catch {
      setError(
        `Couldn't save in this browser. Keep this page open and try again.`,
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return {
    state,
    commit,
    error,
    busy,
    key,
    reload,
    loaded: !loadIssue.current,
  };
}
export function useExecutive(company: Company) {
  const local = useLocalState(company);
  const { user } = useApp(),
    location = useLocation(),
    [query, setQuery] = useSearchParams(),
    key = preferenceKey(user?.id || "guest", company);
  const [prefs, setPrefs] = useState(() => readPreferences(key, company)),
    [error, setError] = useState("");
  const period = (
    Object.hasOwn(periods, query.get("period") || "")
      ? query.get("period")
      : prefs.period
  ) as Period;
  const profile =
    prefs.profile === "auto" ? inferProfile(company) : prefs.profile;
  const requested = query.get("state");
  const initialScenario: Scenario = [
    "workspace",
    "connected",
    "partial",
    "sync-error",
    "stale",
    "clear",
  ].includes(requested || "")
    ? (requested as Scenario)
    : usesExampleData(company)
      ? "connected"
      : "workspace";
  const scenario: Scenario = serverMode
    ? "workspace"
    : ["sync-error", "stale"].includes(initialScenario) &&
        local.state.sync[company.data.sources[0]] === "Synced"
      ? usesExampleData(company)
        ? "connected"
        : "workspace"
      : initialScenario;
  const sample =
    scenario === "workspace"
      ? null
      : buildSample(company, profile, period, scenario);
  const editable = ["Owner", "Admin"].includes(company.role);
  function changePeriod(p: Period) {
    try {
      const next = { ...prefs, period: p };
      localStorage.setItem(key, JSON.stringify(next));
      setPrefs(next);
      const nextQuery = new URLSearchParams(query);
      nextQuery.set("period", p);
      setQuery(nextQuery);
      setError("");
    } catch {
      setError("Couldn't save reporting preferences. Try again.");
    }
  }
  function link(path: string, from?: string) {
    if (!path.startsWith(`/companies/${company.id}/`))
      path = `/companies/${company.id}/overview`;
    const [nextPath, search = ""] = path.split("?"),
      params = new URLSearchParams(search);
    if (requested) params.set("state", requested);
    if (!params.has("period")) params.set("period", period);
    if (from) params.set("from", from);
    return nextPath + "?" + params.toString();
  }
  const origin = location.pathname + location.search;
  const base = `/companies/${company.id}`;
  const back = query.get("from");
  const safeBack =
    back?.startsWith(base + "/") && !back.startsWith("//") ? back : null;
  const money = (n: number) =>
    new Intl.NumberFormat("en", {
      style: "currency",
      currency: prefs.currency,
      maximumFractionDigits: 0,
    }).format(n);
  return {
    company,
    prefs,
    period,
    profile,
    sample,
    scenario,
    editable,
    query,
    setQuery,
    changePeriod,
    link,
    origin,
    base,
    back: safeBack,
    money,
    error: error || local.error,
    reload: () => window.dispatchEvent(new Event("aynor:local-change")),
    localAvailable: local.loaded,
    prefKey: key,
    setPrefs,
  };
}
export type Executive = ReturnType<typeof useExecutive>;
export function ModulePage({
  title,
  description,
  exec,
  back,
  actions,
  children,
  showPeriod = true,
}: {
  title: string;
  description?: string;
  exec: Executive;
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
  showPeriod?: boolean;
}) {
  const location = useLocation();
  useLayoutEffect(() => {
    const key = "aynor.scroll." + location.pathname + location.search;
    let y = 0;
    try {
      y = Number(sessionStorage.getItem(key) || 0);
    } catch {}
    const frame = requestAnimationFrame(() =>
      window.scrollTo({ top: y, behavior: "instant" }),
    );
    return () => {
      cancelAnimationFrame(frame);
      try {
        sessionStorage.setItem(key, String(window.scrollY));
      } catch {}
    };
  }, [location.pathname, location.search]);
  return (
    <div className="intel-page">
      {back && (
        <Link className="intel-back" to={back}>
          <ArrowLeft size={14} />
          Back
        </Link>
      )}
      <div className="intel-heading">
        <div>
          <h1>
            {title}
            <span className="accent">.</span>
          </h1>
          {description && <p>{description}</p>}
        </div>
        <div className="intel-heading-actions">
          {showPeriod && (
            <select
              aria-label="Reporting period"
              value={exec.period}
              onChange={(e) => exec.changePeriod(e.target.value as Period)}
            >
              {Object.entries(periods).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          )}
          {actions}
        </div>
      </div>
      <ErrorBox>{exec.error}</ErrorBox>
      {exec.error && (
        <Button variant="secondary" onClick={exec.reload}>
          Retry local data
        </Button>
      )}
      <DataNotice exec={exec} />
      {children}
    </div>
  );
}
export function DataNotice({ exec }: { exec: Executive }) {
  const location = useLocation();
  if (serverMode)
    return location.pathname.includes("/settings/") ||
      location.pathname.endsWith("/connections") ? null : (
      <div className="intel-notice">
        <Database size={14} />
        <span>
          This module does not yet read your connected financial source.
        </span>
        <Link to={exec.link(exec.base + "/overview", exec.origin)}>
          View live Overview <ArrowUpRight size={12} />
        </Link>
      </div>
    );

  return exec.scenario === "workspace" ? (
    <div className="intel-notice">
      <Database size={14} />
      <span>No validated performance records.</span>
      <Link to={exec.link(exec.base + "/connections", exec.origin)}>
        Set up data <ArrowUpRight size={12} />
      </Link>
    </div>
  ) : exec.scenario === "stale" ||
    exec.scenario === "sync-error" ||
    exec.scenario === "partial" ? (
    <div className="intel-notice warning">
      <Database size={14} />
      <span>
        {exec.scenario === "stale"
          ? "Data is 12 days old."
          : exec.scenario === "sync-error"
            ? "Sync failed; showing cached example records."
            : `Partial coverage: ${exec.sample?.covered.length}/${exec.company.data.departments.length} departments.`}
      </span>
      <Link to={exec.link(exec.base + "/connections", exec.origin)}>
        Review source <ArrowUpRight size={12} />
      </Link>
    </div>
  ) : null;
}
export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="intel-panel">
      <div className="intel-panel-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Blank({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="intel-empty">
      <Database size={23} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Evidence({
  exec,
  lines = [],
}: {
  exec: Executive;
  lines?: string[];
}) {
  return (
    <details className="intel-evidence">
      <summary>Evidence & calculation</summary>
      <p>
        {exec.sample
          ? "Illustrative workbook records"
          : "Workspace configuration only"}{" "}
        · {periods[exec.period]}
        {exec.sample
          ? ` · ${exec.sample.source} · as of ${exec.sample.asOf.toISOString().slice(0, 10)}`
          : ""}
      </p>
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </details>
  );
}
export function AskLink({
  exec,
  context,
  question,
}: {
  exec: Executive;
  context: string;
  question?: string;
}) {
  return (
    <Link
      className="button secondary"
      to={exec.link(
        exec.base +
          "/ask?context=" +
          encodeURIComponent(context) +
          (question ? "&question=" + encodeURIComponent(question) : ""),
        exec.origin,
      )}
    >
      <Sparkles size={14} />
      Ask Aynor
    </Link>
  );
}
export function Confirm({
  title,
  text,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  text: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p>{text}</p>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button busy={busy} variant="danger" onClick={onConfirm}>
          Confirm
        </Button>
      </div>
    </Modal>
  );
}
export function Status({ children }: { children: ReactNode }) {
  const text = String(children);
  return (
    <span
      className="intel-status"
      data-tone={
        /High|attention|Overdue|expired|failed/i.test(text)
          ? "attention"
          : /Achieved|Completed|Synced/i.test(text)
            ? "success"
            : /Limited|No |unavailable/i.test(text)
              ? "muted"
              : "neutral"
      }
    >
      {children}
    </span>
  );
}
export function Loading({ label = "Loading records…" }: { label?: string }) {
  return (
    <div className="intel-loading" role="status">
      <Loader2 size={16} className="spin" />
      {label}
    </div>
  );
}
export function useDraft<T>(key: string, initial: T) {
  const [form, setForm] = useState<T>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (!saved || typeof saved !== "object" || Array.isArray(saved))
        return initial;
      for (const [field, value] of Object.entries(
        initial as Record<string, unknown>,
      ))
        if (
          typeof value === "string" &&
          field in saved &&
          typeof saved[field] !== "string"
        )
          return initial;
      return { ...initial, ...saved };
    } catch {
      return initial;
    }
  });
  const [dirty, setDirty] = useState(
    () => JSON.stringify(form) !== JSON.stringify(initial),
  );
  useEffect(() => {
    if (!dirty) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(form));
    } catch {}
  }, [form, dirty, key]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  return {
    form,
    set: (next: T) => {
      setForm(next);
      setDirty(true);
    },
    dirty,
    clear: () => {
      sessionStorage.removeItem(key);
      setDirty(false);
    },
    reset: () => {
      sessionStorage.removeItem(key);
      setForm(initial);
      setDirty(false);
    },
  };
}

export function setupRoute(exec: Executive, step: string, kind: string) {
  const query = new URLSearchParams({
    return: kind,
    origin: exec.back || exec.base + "/overview",
    period: exec.period,
  });
  for (const key of ["state", "sync"])
    if (exec.query.has(key)) query.set(key, exec.query.get(key)!);
  return exec.base + "/onboarding/" + step + "?" + query.toString();
}
