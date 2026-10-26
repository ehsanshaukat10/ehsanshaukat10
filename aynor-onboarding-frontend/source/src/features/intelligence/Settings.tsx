import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Check, RefreshCw } from "lucide-react";
import { Button, ErrorBox, Field, Modal, Select } from "../../components/ui";
import { api, type Company } from "../../lib/api";
import { useApp } from "../../lib/context";
import { normalizeWebsite } from "../../lib/website";
import {
  availableMetrics,
  periods,
  defaults,
  inferProfile,
  metricLabels,
  sectionLabels,
  type MetricId,
  type Preferences,
  type Section,
} from "../dashboard/model";
import {
  Blank,
  Confirm,
  ModulePage,
  Panel,
  Status,
  useDraft,
  useExecutive,
  useLocalState,
  setupRoute,
  type ModuleProps,
} from "./shared";
export function Settings(props: ModuleProps) {
  const e = useExecutive(props.company),
    panel = useLocation().pathname.split("/")[4] || "profile";
  const tabs = [
    ["profile", "Company profile"],
    ["departments", "Departments"],
    ["connections", "Data connections"],
    ["members", "Team & permissions"],
    ["preferences", "Dashboard preferences"],
  ];
  return (
    <ModulePage
      title="Company settings"
      description="The foundations of your intelligence workspace."
      exec={e}
      back={e.back || e.link(e.base + "/overview")}
    >
      <nav className="intel-settings-tabs" aria-label="Settings sections">
        {tabs.map(([id, label]) => (
          <Link
            key={id}
            className={panel === id ? "active" : ""}
            to={e.link(
              e.base + "/settings/" + id,
              e.back || e.base + "/overview",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      {!e.editable && panel !== "preferences" ? (
        <Blank
          title="Administrator access required"
          text="Your role can investigate the departments in its scope. An Owner or Admin manages company setup."
          action={
            <Link to={e.link(e.base + "/overview")}>Return to overview</Link>
          }
        />
      ) : panel === "profile" ? (
        <Profile {...props} />
      ) : panel === "departments" ? (
        <Panel title="Configured departments">
          {props.company.data.departments.length ? (
            props.company.data.departments.map((d) => (
              <div className="intel-row" key={d}>
                <span>{d}</span>
                <small>
                  {
                    props.company.data.mappings.filter(
                      (m) => m.department === d && !m.ignored,
                    ).length
                  }{" "}
                  mapped fields
                </small>
                <Link
                  to={e.link(
                    e.base + "/departments/" + encodeURIComponent(d),
                    e.origin,
                  )}
                >
                  Inspect <ArrowUpRight size={12} />
                </Link>
              </div>
            ))
          ) : (
            <Blank
              title="No departments configured"
              text="Add the teams your company needs to understand."
            />
          )}
          <Link
            className="button secondary"
            to={setupRoute(e, "departments", "settings-departments")}
          >
            Configure departments <ArrowUpRight size={13} />
          </Link>
        </Panel>
      ) : panel === "connections" ? (
        <Connections {...props} />
      ) : panel === "preferences" ? (
        <PreferenceSettings {...props} />
      ) : (
        <Blank
          title="Settings section unavailable"
          text="Choose one of the available settings sections."
          action={
            <Link to={e.link(e.base + "/settings/profile")}>
              Company profile
            </Link>
          }
        />
      )}
    </ModulePage>
  );
}
function Profile({ company, updateCompany, save }: ModuleProps) {
  const e = useExecutive(company),
    { toast } = useApp(),
    initial = {
      name: company.name,
      industry: company.industry,
      website: company.website,
      size: company.size,
      country: company.country,
      businessModel: company.businessModel || "",
      currency: company.currency,
      timezone: company.timezone,
    };
  const draft = useDraft("aynor.profile.draft." + e.prefKey, initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  return (
    <Panel title="Company profile">
      <ErrorBox>{error}</ErrorBox>
      <form
        className="intel-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          if (!draft.form.name.trim()) {
            setError("Enter a company name.");
            return;
          }
          try {
            new Intl.NumberFormat("en", {
              style: "currency",
              currency: draft.form.currency,
            }).format(1);
            new Intl.DateTimeFormat("en", {
              timeZone: draft.form.timezone,
            }).format(new Date());
          } catch {
            setError("Choose a valid reporting currency and time zone.");
            return;
          }
          setBusy(true);
          try {
            const updated = await api<Company>(
              `/companies/${company.id}/profile`,
              "PATCH",
              {
                ...draft.form,
                website: normalizeWebsite(draft.form.website),
                version: company.version,
              },
            );
            updateCompany(updated);
            draft.clear();
            toast("Company settings updated.");
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Couldn't save the profile. Try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset className="intel-form-fields" disabled={busy}>
          <div className="intel-form-grid">
            {Object.entries({
              name: "Company name",
              industry: "Industry",
              website: "Company website",
              size: "Company size",
              country: "Country",
              businessModel: "Operating model",
              currency: "Reporting currency",
              timezone: "Time zone",
            }).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                required={key === "name"}
                value={draft.form[key as keyof typeof initial]}
                onChange={(event) =>
                  draft.set({ ...draft.form, [key]: event.target.value })
                }
              />
            ))}
          </div>
          <p className="intel-muted">
            Reporting currency labels units; this preview does not convert
            exchange rates.
          </p>
          <div className="intel-footer-actions">
            <Button busy={busy}>Save company settings</Button>
            <Button
              type="button"
              variant="text"
              disabled={!draft.dirty}
              onClick={() => setDiscard(true)}
            >
              Discard changes
            </Button>
            <small>{draft.dirty ? "Draft retained in this browser" : ""}</small>
          </div>
        </fieldset>
      </form>
      <div className="intel-profile-priorities">
        <h3>Business priorities</h3>
        <p>
          {company.data.priorities.join(" · ") || "No priorities configured."}
        </p>
        <Link to={setupRoute(e, "priorities", "settings-profile")}>
          Edit priorities <ArrowUpRight size={12} />
        </Link>
      </div>
      {discard && (
        <Confirm
          title="Discard profile changes?"
          text="The unsaved draft will be cleared."
          onCancel={() => setDiscard(false)}
          onConfirm={() => {
            draft.reset();
            setDiscard(false);
          }}
        />
      )}
    </Panel>
  );
}
function Connections(props: ModuleProps) {
  const e = useExecutive(props.company),
    local = useLocalState(props.company),
    { toast } = useApp(),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(""),
    [remove, setRemove] = useState(""),
    [failed, setFailed] = useState(false);
  const qa = e.query.get("sync"),
    defaultState =
      qa === "expired"
        ? "Permission expired"
        : qa === "error"
          ? "Sync failed"
          : props.company.data.mappings.some((m) => !m.confirmed && !m.ignored)
            ? "Mapping incomplete"
            : "Configured";
  const refresh = async (source: string) => {
    if (busy) return;
    setBusy(source);
    setError("");
    await new Promise((r) => setTimeout(r, 450));
    if (qa === "error" && !failed) {
      setFailed(true);
      setError("Couldn't refresh the sheet. Try again.");
      setBusy("");
      return;
    }
    if ((local.state.sync[source] || defaultState) === "Permission expired") {
      setError("Connection access needs to be restored before refreshing.");
      setBusy("");
      return;
    }
    await local.commit(
      {
        ...local.state,
        sync: {
          ...local.state.sync,
          [source]:
            props.company.data.mappings.some(
              (m) => !m.confirmed && !m.ignored,
            ) ||
            !props.company.data.mappings.some((m) => m.confirmed && !m.ignored)
              ? "Mapping incomplete"
              : "Synced",
        },
      },
      "Example source refreshed.",
    );
    setBusy("");
  };
  return (
    <Panel title="Data connections">
      <p className="intel-muted">
        Connections and refresh are simulated. No Google account or external
        document is accessed.
      </p>
      <ErrorBox>
        {error || (local.error !== e.error ? local.error : "")}
      </ErrorBox>
      {props.company.data.sources.length ? (
        props.company.data.sources.map((source) => {
          const status =
            busy === source
              ? "Sync in progress"
              : local.state.sync[source] || defaultState;
          return (
            <div className="intel-source" key={source}>
              <div>
                <h3>{source}</h3>
                <small>
                  {
                    props.company.data.mappings.filter(
                      (m) => m.confirmed && !m.ignored,
                    ).length
                  }{" "}
                  confirmed fields ·{" "}
                  {e.sample
                    ? "Illustrative records"
                    : "No validated performance records"}
                </small>
              </div>
              <Status>{status}</Status>
              <div className="intel-footer-actions">
                <Button
                  variant="secondary"
                  busy={busy === source}
                  disabled={!!busy || local.busy}
                  onClick={() => refresh(source)}
                >
                  <RefreshCw size={13} />
                  {error ? "Retry refresh" : "Refresh"}
                </Button>
                <Button
                  variant="text"
                  disabled={!!busy}
                  onClick={() => setConsent(source)}
                >
                  Reconnect
                </Button>
                <Link
                  className="button text"
                  to={setupRoute(e, "mapping", "settings-connections")}
                >
                  Review mapping
                </Link>
                <Button
                  variant="text"
                  disabled={!!busy}
                  onClick={() => setRemove(source)}
                >
                  Remove connection
                </Button>
              </div>
            </div>
          );
        })
      ) : (
        <Blank
          title="No sources configured"
          text="Start with a Google Sheet, an uploaded file or a spreadsheet URL."
          action={
            <Link
              className="button secondary"
              to={setupRoute(e, "integrations", "settings-connections")}
            >
              Connect data
            </Link>
          }
        />
      )}
      <Link
        className="button secondary"
        to={setupRoute(e, "integrations", "settings-connections")}
      >
        Add a source <ArrowUpRight size={13} />
      </Link>
      {consent && (
        <Modal title="Reconnect example source" onClose={() => setConsent("")}>
          <p>
            This grants access only inside the local frontend demonstration. No
            OAuth service is contacted.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setConsent("")}>
              Cancel
            </Button>
            <Button
              busy={local.busy}
              onClick={async () => {
                if (
                  await local.commit(
                    {
                      ...local.state,
                      sync: { ...local.state.sync, [consent]: "Configured" },
                    },
                    "Example connection restored.",
                  )
                ) {
                  setConsent("");
                  setError("");
                }
              }}
            >
              <Check size={14} />
              Reconnect example
            </Button>
          </div>
        </Modal>
      )}
      {remove && (
        <Confirm
          title="Remove this connection?"
          text="This removes the source from workspace setup. Existing fields will require mapping review; no external spreadsheet is deleted."
          busy={!!busy}
          onCancel={() => setRemove("")}
          onConfirm={async () => {
            setBusy(remove);
            const sources = props.company.data.sources.filter(
              (s) => s !== remove,
            );
            if (
              await props.save({
                ...props.company.data,
                sources,
                mappings: sources.length
                  ? props.company.data.mappings.map((m) => ({
                      ...m,
                      confirmed: false,
                    }))
                  : [],
                connected: sources.length > 0,
                demo: sources.length > 0 && props.company.data.demo,
                steps: {
                  ...props.company.data.steps,
                  integrations: sources.length ? "completed" : "skipped",
                  mapping: "skipped",
                },
              })
            ) {
              setRemove("");
              toast("Connection removed from this workspace.");
            }
            setBusy("");
          }}
        />
      )}
    </Panel>
  );
}
function PreferenceSettings({ company }: ModuleProps) {
  const e = useExecutive(company),
    { toast } = useApp(),
    draft = useDraft<Preferences>(
      "aynor.preferences.draft." + e.prefKey,
      e.prefs,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const p = draft.form,
    metrics = availableMetrics(
      p.profile === "auto" ? inferProfile(company) : p.profile,
      company,
    );
  return (
    <Panel title="Dashboard preferences">
      <ErrorBox>{error}</ErrorBox>
      <form
        className="intel-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          try {
            await new Promise((r) => setTimeout(r, 160));
            localStorage.setItem(e.prefKey, JSON.stringify(p));
            e.setPrefs(p);
            draft.clear();
            toast("Dashboard preferences saved.");
          } catch {
            setError("Couldn't save dashboard preferences. Try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Select
          label="Default reporting period"
          value={p.period}
          options={["30d", "quarter", "year"]}
          onChange={(v) =>
            draft.set({ ...p, period: v as Preferences["period"] })
          }
        />
        <h3>Pin up to three measures</h3>
        <div className="intel-checkboxes">
          {metrics.map((id) => (
            <label key={id}>
              <input
                type="checkbox"
                checked={p.metrics.includes(id)}
                disabled={!p.metrics.includes(id) && p.metrics.length >= 3}
                onChange={(event) =>
                  draft.set({
                    ...p,
                    metrics: event.target.checked
                      ? [...p.metrics, id]
                      : p.metrics.filter((m) => m !== id),
                  })
                }
              />
              {metricLabels[id]}
            </label>
          ))}
        </div>
        <h3>Optional sections</h3>
        <p className="intel-muted">
          Critical alerts and data-quality warnings always remain visible.
        </p>
        {p.order.map((section, i) => (
          <div className="intel-order" key={section}>
            <label>
              <input
                type="checkbox"
                checked={p.sections.includes(section)}
                onChange={(event) =>
                  draft.set({
                    ...p,
                    sections: event.target.checked
                      ? [...p.sections, section]
                      : p.sections.filter((s) => s !== section),
                  })
                }
              />
              {sectionLabels[section]}
            </label>
            <button
              type="button"
              disabled={i === 0}
              aria-label={`Move ${sectionLabels[section]} up`}
              onClick={() => {
                const order = [...p.order];
                [order[i - 1], order[i]] = [order[i], order[i - 1]];
                draft.set({ ...p, order });
              }}
            >
              ↑
            </button>
            <button
              type="button"
              disabled={i === p.order.length - 1}
              aria-label={`Move ${sectionLabels[section]} down`}
              onClick={() => {
                const order = [...p.order];
                [order[i + 1], order[i]] = [order[i], order[i + 1]];
                draft.set({ ...p, order });
              }}
            >
              ↓
            </button>
          </div>
        ))}
        <h3>Visible departments</h3>
        <div className="intel-checkboxes">
          {company.data.departments.map((d) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={p.departments === null || p.departments.includes(d)}
                onChange={(event) =>
                  draft.set({
                    ...p,
                    departments: event.target.checked
                      ? Array.from(
                          new Set([
                            ...(p.departments || company.data.departments),
                            d,
                          ]),
                        )
                      : (p.departments || company.data.departments).filter(
                          (v) => v !== d,
                        ),
                  })
                }
              />
              {d}
            </label>
          ))}
        </div>
        <div className="intel-footer-actions">
          <Button busy={busy}>Save preferences</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => draft.set(defaults(company))}
          >
            Restore defaults
          </Button>
          <Link to={e.link(e.base + "/overview")}>
            View overview <ArrowUpRight size={12} />
          </Link>
        </div>
      </form>
    </Panel>
  );
}
