import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ArrowUpRight, Minus, Plus } from "lucide-react";
import { Button } from "../../components/ui";
import {
  AskLink,
  Blank,
  Evidence,
  ModulePage,
  Panel,
  Status,
  useExecutive,
  type ModuleProps,
} from "./shared";
const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export function Dependencies({ company }: ModuleProps) {
  const e = useExecutive(company),
    location = useLocation(),
    parts = location.pathname.split("/").slice(4),
    entityId = parts[0],
    relation = entityId === "relationship" ? parts[1] : null;
  const graphRef = useRef<HTMLDivElement>(null);
  const positionKey = "aynor.graph." + e.prefKey + e.origin;
  useEffect(() => {
    try {
      if (graphRef.current)
        graphRef.current.scrollLeft = Number(
          sessionStorage.getItem(positionKey) || 0,
        );
    } catch {}
  }, [positionKey]);
  const allProjects = e.sample?.projects || [];
  const entities = new Map<
    string,
    { id: string; name: string; type: string; department: string }
  >();
  allProjects.forEach((p) => {
    entities.set("project-" + p.id, {
      id: "project-" + p.id,
      name: p.name,
      type: "Projects",
      department: p.department,
    });
    if (p.client)
      entities.set("client-" + slug(p.client), {
        id: "client-" + slug(p.client),
        name: p.client,
        type: "Clients",
        department: p.department,
      });
    if (p.owner)
      entities.set("person-" + slug(p.owner), {
        id: "person-" + slug(p.owner),
        name: p.owner,
        type: "People",
        department: p.department,
      });
  });
  const entity = entityId ? entities.get(entityId) : null,
    base = e.base + "/dependencies",
    back = e.back || e.link(base);
  const q = e.query.get("q") || "",
    type = e.query.get("type") || "All",
    view = e.query.get("view") || "Graph",
    zoom = Math.min(1.5, Math.max(0.75, Number(e.query.get("zoom") || 1) || 1));
  const change = (key: string, value: string) => {
    const query = new URLSearchParams(e.query);
    query.set(key, value);
    e.setQuery(query);
  };
  const node = (id: string) => e.link(base + "/" + id, e.origin);
  if (relation) {
    const p = allProjects.find((p) => p.id === relation);
    return (
      <ModulePage
        title="Connected delivery risk"
        exec={e}
        back={back}
        actions={
          p && (
            <AskLink
              exec={e}
              context={`${p.client} → ${p.name} → ${p.owner}`}
            />
          )
        }
      >
        {p ? (
          <>
            <Panel title="Relationship explanation">
              <h3>
                {p.client} → {p.name} → {p.owner}
              </h3>
              <p>{p.evidence}</p>
              <p>
                {p.status === "On track"
                  ? "No current delivery exception is recorded."
                  : "Delivery is exposed to an approval or capacity bottleneck. Confirm the delivery owner and resolve the shared dependency."}
              </p>
              <div className="intel-inline-links">
                <Link to={node("client-" + slug(p.client))}>
                  Client <ArrowUpRight size={12} />
                </Link>
                <Link to={node("project-" + p.id)}>
                  Project <ArrowUpRight size={12} />
                </Link>
                <Link to={node("person-" + slug(p.owner))}>
                  Resource <ArrowUpRight size={12} />
                </Link>
              </div>
              <Evidence
                exec={e}
                lines={[
                  p.evidence,
                  `Due ${p.due}. Department: ${p.department}.`,
                ]}
              />
            </Panel>
            <DependencyRisks e={e} department={p.department} />
          </>
        ) : (
          <Blank
            title="Relationship unavailable"
            text="This relationship is no longer present in available records."
            action={<Link to={e.link(base)}>Return to dependencies</Link>}
          />
        )}
      </ModulePage>
    );
  }
  if (entityId)
    return (
      <ModulePage
        title={entity?.name || "Entity unavailable"}
        description={entity?.type}
        exec={e}
        back={back}
        actions={
          entity && (
            <AskLink exec={e} context={`${entity.type}: ${entity.name}`} />
          )
        }
      >
        {entity ? (
          <>
            <Panel title="Direct relationships">
              {allProjects
                .filter(
                  (p) =>
                    p.name === entity.name ||
                    p.client === entity.name ||
                    p.owner === entity.name,
                )
                .map((p) => (
                  <div className="intel-relationship-row" key={p.id}>
                    <Link to={node("client-" + slug(p.client))}>
                      {p.client}
                    </Link>
                    <Link
                      className="intel-edge"
                      aria-label={`Explain ${p.name} relationship`}
                      to={e.link(base + "/relationship/" + p.id, e.origin)}
                    >
                      <ArrowRight size={16} />
                    </Link>
                    <Link to={node("project-" + p.id)}>{p.name}</Link>
                    <Link
                      className="intel-edge"
                      aria-label={`Explain ${p.name} resource dependency`}
                      to={e.link(base + "/relationship/" + p.id, e.origin)}
                    >
                      <ArrowRight size={16} />
                    </Link>
                    <Link to={node("person-" + slug(p.owner))}>{p.owner}</Link>
                    <Status>{p.status}</Status>
                  </div>
                ))}
              <Link
                className="intel-row"
                to={e.link(
                  e.base +
                    "/departments/" +
                    encodeURIComponent(entity.department),
                  e.origin,
                )}
              >
                Related department: {entity.department}
                <ArrowUpRight size={14} />
              </Link>
              <Evidence
                exec={e}
                lines={allProjects
                  .filter(
                    (p) =>
                      p.name === entity.name ||
                      p.client === entity.name ||
                      p.owner === entity.name,
                  )
                  .map((p) => p.evidence)}
              />
            </Panel>
            <DependencyRisks
              e={e}
              department={entity.department}
              person={entity.type === "People" ? entity.name : undefined}
            />
          </>
        ) : (
          <Blank
            title="This entity is not available"
            text="It may have been removed, be missing an identifier, or fall outside your department access."
            action={
              <Link className="button secondary" to={e.link(base)}>
                Return to dependencies
              </Link>
            }
          />
        )}
      </ModulePage>
    );
  const visible = allProjects.filter(
    (p) =>
      [p.name, p.client, p.owner].some((n) =>
        n.toLowerCase().includes(q.toLowerCase()),
      ) &&
      (type === "All" ||
        type === "Projects" ||
        (type === "Clients" && !!p.client) ||
        (type === "People" && !!p.owner)),
  );
  return (
    <ModulePage
      title="Dependencies"
      description="Follow the relationships behind a business risk."
      exec={e}
    >
      <div className="intel-toolbar">
        <input
          aria-label="Search entities"
          placeholder="Client, project or person"
          value={q}
          onChange={(v) => change("q", v.target.value)}
        />
        <select
          aria-label="Entity type"
          value={type}
          onChange={(v) => change("type", v.target.value)}
        >
          {["All", "Clients", "Projects", "People", "Products"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <div className="intel-tabs">
          {["Graph", "List"].map((v) => (
            <button
              key={v}
              aria-pressed={view === v}
              onClick={() => change("view", v)}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <Panel
        title="Connected commitments"
        action={
          view === "Graph" &&
          visible.length > 0 && (
            <div className="intel-zoom">
              <Button
                aria-label="Zoom out"
                disabled={zoom <= 0.75}
                variant="text"
                onClick={() =>
                  change("zoom", String(Math.max(0.75, zoom - 0.1)))
                }
              >
                <Minus size={13} />
              </Button>
              <span>{Math.round(zoom * 100)}%</span>
              <Button
                aria-label="Zoom in"
                disabled={zoom >= 1.5}
                variant="text"
                onClick={() =>
                  change("zoom", String(Math.min(1.5, zoom + 0.1)))
                }
              >
                <Plus size={13} />
              </Button>
            </div>
          )
        }
      >
        {visible.length ? (
          view === "Graph" ? (
            <>
              <div
                className="intel-graph-viewport"
                ref={graphRef}
                onScroll={(event) => {
                  try {
                    sessionStorage.setItem(
                      positionKey,
                      String(event.currentTarget.scrollLeft),
                    );
                  } catch {}
                }}
              >
                <div className="intel-graph" style={{ zoom }}>
                  {visible.slice(0, 6).map((p) => (
                    <div className="intel-relationship-row" key={p.id}>
                      <Link to={node("client-" + slug(p.client))}>
                        <small>Client</small>
                        {p.client || "Missing client ID"}
                      </Link>
                      <Link
                        className="intel-edge"
                        to={e.link(base + "/relationship/" + p.id, e.origin)}
                        aria-label={`Explain ${p.name} relationship`}
                      >
                        <ArrowRight size={17} />
                      </Link>
                      <Link to={node("project-" + p.id)}>
                        <small>Project · {p.status}</small>
                        {p.name}
                      </Link>
                      <Link
                        className="intel-edge"
                        to={e.link(base + "/relationship/" + p.id, e.origin)}
                        aria-label={`Explain ${p.name} capacity`}
                      >
                        <ArrowRight size={17} />
                      </Link>
                      <Link to={node("person-" + slug(p.owner))}>
                        <small>Person</small>
                        {p.owner || "Missing person ID"}
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
              {visible.length > 6 && (
                <Button variant="text" onClick={() => change("view", "List")}>
                  Show all {visible.length} relationships in list
                </Button>
              )}
            </>
          ) : (
            visible.map((p) => (
              <Link
                className="intel-row"
                key={p.id}
                to={node("project-" + p.id)}
              >
                <span>
                  {p.name}
                  <small>
                    {p.client} · {p.owner} · {p.department}
                  </small>
                </span>
                <Status>{p.status}</Status>
                <ArrowUpRight size={14} />
              </Link>
            ))
          )
        ) : (
          <Blank
            title={
              !allProjects.length
                ? "No dependencies mapped"
                : "No matching entities"
            }
            text={
              !allProjects.length
                ? "Connect project, client and resource identifiers before investigating relationships."
                : type === "Products"
                  ? "Product identifiers are not present in the available records."
                  : "Try another entity type or search."
            }
            action={
              allProjects.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const query = new URLSearchParams(e.query);
                    query.delete("q");
                    query.delete("type");
                    e.setQuery(query);
                  }}
                >
                  Reset filters
                </Button>
              ) : (
                <Link
                  className="button secondary"
                  to={e.link(e.base + "/settings/connections", e.origin)}
                >
                  Review data connections
                </Link>
              )
            }
          />
        )}
      </Panel>
      {visible.length > 0 && <DependencyRisks e={e} />}
    </ModulePage>
  );
}
function DependencyRisks({
  e,
  department,
  person,
}: {
  e: ReturnType<typeof useExecutive>;
  department?: string;
  person?: string;
}) {
  const risks =
    e.sample?.risks.filter(
      (r) =>
        (person
          ? r.evidence.some((line) => line.includes(person))
          : !department || r.department === department) &&
        ["delivery", "resource", "sla"].includes(r.type),
    ) || [];
  return (
    <Panel title="Related decisions">
      {risks.length ? (
        risks.map((r) => (
          <Link
            className="intel-row"
            key={r.id}
            to={e.link(e.base + "/actions/" + r.id, e.origin)}
          >
            <span>
              {r.title}
              <small>{r.impact}</small>
            </span>
            <Status>{r.severity}</Status>
            <ArrowUpRight size={14} />
          </Link>
        ))
      ) : (
        <Blank
          title={
            e.sample ? "No connected risks flagged" : "Insufficient evidence"
          }
          text={
            e.sample
              ? "No supported risk is identified in these relationships."
              : "Source records are needed before assessing connected risks."
          }
        />
      )}
    </Panel>
  );
}
