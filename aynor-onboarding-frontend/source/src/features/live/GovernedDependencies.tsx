import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button, ErrorBox, Field, Modal } from "../../components/ui";
import type { Company } from "../../lib/api";
import { serverRequest } from "../../lib/runtime";
import { Panel, Blank, Status } from "../intelligence/shared";
import { GovernedModule, useGovernedModule } from "./GovernedModule";
import { intelligenceQuery } from "./intelligence-cache";
import { displayPeriod, type SemanticPeriod } from "./semantic-types";
type Entity = {
  id: string;
  type: string;
  identifier: string | number;
  label: string | null;
  department: string;
  scope: string;
};
type Relationship = {
  id: string;
  contractId: string;
  label: string;
  from: Entity;
  to: Entity;
  period: SemanticPeriod;
  state: string;
  definition: string;
};
type Endpoint = {
  scope: string;
  entity: string;
  idColumn: string;
  labelColumn: string;
  namespace: string;
  schema: string;
};
type Contract = {
  id: string;
  label: string;
  from: Endpoint;
  to: Endpoint;
  foreignKey: string;
  confirmed: true;
};
type Worksheet = {
  scope: string;
  title: string;
  entity: string;
  department: string;
  idColumn: string;
  namespace: string;
  schema: string;
  columns: { name: string; type: string }[];
};
type View = {
  scopes: { id: string; label: string; currency: null }[];
  datasetRevision: string;
  authorization: { fingerprint: string };
  relationships: Relationship[];
  diagnostics: {
    id: string;
    label: string;
    state: string;
    reason: string;
    missingIdentifiers: number;
    duplicateIdentifiers: number;
    missingReferences: number;
    unresolvedReferences: number;
  }[];
  concerns: {
    id: string;
    title: string;
    entity: Entity;
    period: SemanticPeriod;
    projectCount: number;
    relationshipIds: string[];
    explanation: string;
  }[];
  configuration?: { contracts: Contract[]; worksheets: Worksheet[] };
  state: string;
};
type Evidence = {
  sources: {
    scope: string;
    sourceTitle: string;
    tabTitle: string;
    rowReference: number;
    columns: string[];
    rows: (string | number | null)[][];
  }[];
};
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, value]) => [k, canonical(value)]),
        )
      : v;
const name = (e: Entity) =>
  e.label ? `${e.label} · ${e.identifier}` : String(e.identifier);
const blankEndpoint = (): Endpoint => ({
  scope: "",
  entity: "",
  idColumn: "",
  labelColumn: "",
  namespace: "",
  schema: "",
});
export function GovernedDependencies({ company }: { company: Company }) {
  const m = useGovernedModule(company),
    location = useLocation(),
    parts = location.pathname.split("/").slice(4),
    id = parts[0] || "",
    evidencePage = parts[1] === "evidence",
    root = m.base + "/dependencies",
    api = m.base + "/intelligence";
  const [stored, setStored] = useState<{ key: string; view: View } | null>(
      null,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [refresh, setRefresh] = useState(0),
    [storedEvidence, setEvidence] = useState<{
      key: string;
      value: Evidence;
    } | null>(null);
  const [draft, setDraft] = useState<Contract | null>(null),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(""),
    [success, setSuccess] = useState("");
  const key = m.report
    ? JSON.stringify([
        m.report.authorization.fingerprint,
        m.report.datasetRevision,
        m.report.context.key,
      ])
    : "";
  const evidence =
    storedEvidence?.key === key + id ? storedEvidence.value : null;
  const view = stored?.key === key ? stored.view : null,
    relationship = view?.relationships.find((r) => r.id === id);
  useEffect(() => {
    if (!m.report) return;
    let active = true;
    setBusy(true);
    setError("");
    serverRequest<View>(
      api + "/relationships?" + intelligenceQuery(location.search),
    )
      .then((v) => {
        if (!active) return;
        if (
          v.authorization.fingerprint !== m.report!.authorization.fingerprint ||
          v.datasetRevision !== m.report!.datasetRevision
        ) {
          setStored(null);
          m.retry();
          return;
        }
        setStored({ key, view: v });
      })
      .catch((e) => {
        if (active) {
          setStored(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [m.report, refresh, api, location.search]);
  useEffect(() => {
    if (!evidencePage || !relationship || !view) return;
    let active = true;
    setBusy(true);
    serverRequest<Evidence>(
      api +
        `/relationship-evidence?${intelligenceQuery(location.search)}&relationshipId=${id}&revision=${view.datasetRevision}`,
    )
      .then((v) => {
        if (active) setEvidence({ key: key + id, value: v });
      })
      .catch((e) => {
        if (active) {
          setEvidence(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [evidencePage, relationship, view, refresh]);
  useEffect(() => {
    setDraft(null);
    setSaveError("");
    setSuccess("");
  }, [company.id]);
  const rows = (view?.relationships || []).filter(
    (r) =>
      !m.query.get("q") ||
      `${r.label} ${name(r.from)} ${name(r.to)}`
        .toLowerCase()
        .includes(m.query.get("q")!.toLowerCase()),
  );
  async function save() {
    if (!draft || !view?.configuration || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const latest = await serverRequest<
        Omit<Company, "data"> & {
          data: Company["data"] & { relationshipContracts?: Contract[] };
        }
      >(m.base);
      // CAS: never overwrite another administrator's relationship edits from this open dialog.
      if (
        JSON.stringify(canonical(latest.data.relationshipContracts || [])) !==
        JSON.stringify(canonical(view.configuration.contracts))
      )
        throw Error(
          "Relationship configuration changed. Close this dialog and refresh before saving.",
        );
      await serverRequest(m.base, "PATCH", {
        version: latest.version,
        data: {
          ...latest.data,
          relationshipContracts: [
            ...view.configuration.contracts.filter((c) => c.id !== draft.id),
            draft,
          ],
        },
      });
      setDraft(null);
      setSuccess(
        "Relationship mapping confirmed. Only validated ID matches will appear.",
      );
      m.retry();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  function endpointField(side: "from" | "to") {
    if (!draft || !view?.configuration) return null;
    const e = draft[side],
      option = view.configuration.worksheets.find((w) => w.scope === e.scope);
    return (
      <>
        <label className="field">
          <span>
            {side === "from" ? "Source worksheet" : "Referenced worksheet"}
          </span>
          <select
            aria-label={
              side === "from" ? "Source worksheet" : "Referenced worksheet"
            }
            value={e.scope}
            disabled={saving}
            onChange={(ev) => {
              const w = view.configuration!.worksheets.find(
                (w) => w.scope === ev.target.value,
              );
              setDraft({
                ...draft,
                [side]: {
                  scope: w?.scope || "",
                  entity: w?.entity === "other" ? "" : w?.entity || "",
                  idColumn: w?.idColumn || "",
                  labelColumn: "",
                  namespace: w?.namespace || "",
                  schema: w?.schema || "",
                },
                ...(side === "from" ? { foreignKey: "" } : {}),
              });
            }}
          >
            <option value="">Choose worksheet</option>
            {view.configuration.worksheets.map((w) => (
              <option key={w.scope} value={w.scope}>
                {w.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{side === "from" ? "Source entity" : "Referenced entity"}</span>
          <select
            aria-label={side === "from" ? "Source entity" : "Referenced entity"}
            value={e.entity}
            disabled={saving}
            onChange={(ev) =>
              setDraft({ ...draft, [side]: { ...e, entity: ev.target.value } })
            }
          >
            <option value="">Choose entity type</option>
            {[
              "project",
              "client",
              "employee",
              "resource",
              "invoice",
              "deal",
            ].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <p>
          Confirmed ID:{" "}
          {option?.idColumn ||
            "Confirm a unique record ID in Data connections first."}
        </p>
        <label className="field">
          <span>
            {side === "from"
              ? "Source display name"
              : "Referenced display name"}
          </span>
          <select
            aria-label={
              side === "from"
                ? "Source display name"
                : "Referenced display name"
            }
            value={e.labelColumn}
            disabled={saving}
            onChange={(ev) =>
              setDraft({
                ...draft,
                [side]: { ...e, labelColumn: ev.target.value },
              })
            }
          >
            <option value="">Use identifier only</option>
            {option?.columns
              .filter((c) => c.type === "text")
              .map((c) => (
                <option key={c.name}>{c.name}</option>
              ))}
          </select>
        </label>
      </>
    );
  }
  return (
    <GovernedModule
      title={
        relationship
          ? `${name(relationship.from)} → ${name(relationship.to)}`
          : "Dependencies"
      }
      description="Confirmed business relationships and their evidence."
      module={m}
      reportingScopes={view?.scopes}
      back={id ? m.back || m.link(root) : undefined}
      actions={
        view?.configuration && !id ? (
          <Button
            onClick={() => {
              setSaveError("");
              setDraft({
                id: crypto.randomUUID(),
                label: "",
                from: blankEndpoint(),
                to: blankEndpoint(),
                foreignKey: "",
                confirmed: true,
              });
            }}
          >
            Confirm relationship
          </Button>
        ) : undefined
      }
    >
      {error && !m.error && (
        <>
          <ErrorBox>{error}</ErrorBox>
          <Button
            variant="secondary"
            onClick={() => {
              setError("");
              setRefresh((v) => v + 1);
            }}
          >
            Retry dependencies
          </Button>
        </>
      )}
      {busy && (
        <p role="status">
          {view
            ? "Updating relationships…"
            : "Loading authorized relationships…"}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {id ? (
        relationship ? (
          <>
            <Panel title="Confirmed relationship">
              <Status>Validated</Status>
              <p>{relationship.label}</p>
              <p>
                {relationship.from.type}: {name(relationship.from)} →{" "}
                {relationship.to.type}: {name(relationship.to)}
              </p>
              <p>{relationship.definition}</p>
              <p>{displayPeriod(relationship.period)}</p>
              {!evidencePage && (
                <Link to={m.link(`${root}/${id}/evidence`, m.origin)}>
                  View source evidence
                </Link>
              )}
            </Panel>
            {evidencePage &&
              evidence?.sources.map((s, i) => (
                <Panel
                  key={s.scope + String(i)}
                  title={`${s.sourceTitle} / ${s.tabTitle}`}
                >
                  <p>
                    Snapshot row {s.rowReference + 1} · current authorized
                    dataset revision
                  </p>
                  {s.columns.map((c, j) => (
                    <div className="intel-row" key={c}>
                      <span>{c}</span>
                      <strong>{String(s.rows[0][j] ?? "—")}</strong>
                    </div>
                  ))}
                </Panel>
              ))}
          </>
        ) : !busy && !error ? (
          <Blank
            title="Relationship unavailable"
            text="No confirmed relationship is available for this reporting scope and access."
          />
        ) : null
      ) : (
        <>
          <Panel title="Needs attention">
            {view?.concerns.length ? (
              view.concerns.map((c) => (
                <div key={c.id}>
                  <h3>
                    {c.title}: {name(c.entity)}
                  </h3>
                  <p>{c.explanation}</p>
                  <p>{displayPeriod(c.period)}</p>
                  {c.relationshipIds.map((rid, i) => (
                    <Link
                      className="intel-row"
                      key={rid}
                      to={m.link(`${root}/${rid}`, m.origin)}
                    >
                      Investigate{" "}
                      {name(view.relationships.find((r) => r.id === rid)!.from)}
                    </Link>
                  ))}
                </div>
              ))
            ) : (
              <p>
                {view?.state === "validated"
                  ? "No shared-resource dependency is established in these confirmed relationships."
                  : "Dependency concerns cannot be fully assessed until relationships are confirmed and validated."}
              </p>
            )}
          </Panel>
          <Panel title="Confirmed relationships">
            <div className="intel-toolbar">
              <input
                aria-label="Find a relationship"
                placeholder="Find a relationship"
                value={m.query.get("q") || ""}
                onChange={(e) => m.change("q", e.target.value)}
              />
            </div>
            {rows.map((r) => (
              <Link
                className="intel-row"
                key={r.id}
                to={m.link(`${root}/${r.id}`, m.origin)}
              >
                <span>
                  {name(r.from)} → {name(r.to)}
                  <small>
                    {r.label} · {r.from.department || "Unassigned"} →{" "}
                    {r.to.department || "Unassigned"} ·{" "}
                    {displayPeriod(r.period)}
                  </small>
                </span>
                <Status>Confirmed</Status>
              </Link>
            ))}
            {!rows.length && !busy && !error && (
              <Blank
                title="No confirmed relationships in this view"
                text="Relationships require explicitly confirmed ID references, compatible reporting periods and access to both endpoints. Similar names are never joined."
              />
            )}
          </Panel>
          {!!view?.diagnostics.filter((d) => d.state !== "validated")
            .length && (
            <Panel title="Relationship checks">
              {view.diagnostics
                .filter((d) => d.state !== "validated")
                .map((d) => (
                  <div key={d.id}>
                    <h3>{d.label}</h3>
                    <Status>
                      {d.state === "partial" ? "Partial" : "Needs review"}
                    </Status>
                    <p>{d.reason}</p>
                    {d.state === "partial" && (
                      <p>
                        {d.missingIdentifiers} missing IDs ·{" "}
                        {d.duplicateIdentifiers} duplicate-ID rows ·{" "}
                        {d.missingReferences} empty references ·{" "}
                        {d.unresolvedReferences} unresolved references
                      </p>
                    )}
                    {m.report?.authorization.canManageSources && (
                      <Link
                        to={m.link(m.base + "/connections?map=1", m.origin)}
                      >
                        Review source mappings
                      </Link>
                    )}
                  </div>
                ))}
            </Panel>
          )}
          {view?.configuration && (
            <Panel title="Confirmed mapping contracts">
              {view.configuration.contracts.map((c) => (
                <div className="intel-row" key={c.id}>
                  <span>{c.label}</span>
                  <Button
                    variant="text"
                    onClick={() => {
                      setSaveError("");
                      setDraft(c);
                    }}
                  >
                    Review mapping
                  </Button>
                </div>
              ))}
              {!view.configuration.contracts.length && (
                <p>No relationship mappings have been confirmed.</p>
              )}
            </Panel>
          )}
        </>
      )}
      {draft && (
        <Modal
          title="Confirm relationship mapping"
          onClose={() => {
            if (!saving) setDraft(null);
          }}
        >
          <ErrorBox>{saveError}</ErrorBox>
          <Field
            label="Relationship name"
            value={draft.label}
            disabled={saving}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          {endpointField("from")}
          <label className="field">
            <span>Reference ID column in source worksheet</span>
            <select
              aria-label="Reference ID column"
              value={draft.foreignKey}
              disabled={saving}
              onChange={(e) =>
                setDraft({ ...draft, foreignKey: e.target.value })
              }
            >
              <option value="">Choose reference column</option>
              {view?.configuration?.worksheets
                .find((w) => w.scope === draft.from.scope)
                ?.columns.filter((c) => ["text", "number"].includes(c.type))
                .map((c) => (
                  <option key={c.name}>{c.name}</option>
                ))}
            </select>
          </label>
          {endpointField("to")}
          <p>
            Confirm that the reference column contains exact IDs from the
            referenced worksheet. Names and similar-looking IDs are not matches.
            Both worksheets must have compatible confirmed periods.
          </p>
          <div className="modal-actions">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              Cancel
            </Button>
            <Button
              busy={saving}
              disabled={
                !draft.from.entity ||
                !draft.to.entity ||
                !draft.label.trim() ||
                !draft.from.idColumn ||
                !draft.to.idColumn ||
                !draft.foreignKey
              }
              onClick={save}
            >
              Confirm ID mapping
            </Button>
          </div>
        </Modal>
      )}
    </GovernedModule>
  );
}
