import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Building2,
  BriefcaseBusiness,
  Crosshair,
  MousePointer2,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import type { Project, Risk } from "../dashboard/model";
import type { useExecutive } from "./shared";

type Executive = ReturnType<typeof useExecutive>;
type MapNode = {
  id: string;
  name: string;
  kind: "Client" | "Project" | "Person" | "Signal";
  sub: string;
  x: number;
  y: number;
  attention?: boolean;
  href: string;
  evidence: string;
};
type Edge = {
  id: string;
  from: string;
  to: string;
  project: string;
  label: string;
  attention?: boolean;
};
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const icons = {
  Client: Building2,
  Project: BriefcaseBusiness,
  Person: UserRound,
  Signal: ShieldAlert,
};

export function DependencyMap({
  projects,
  risks,
  exec: e,
  zoom,
  focus,
  onFocus,
}: {
  projects: Project[];
  risks: Risk[];
  exec: Executive;
  zoom: number;
  focus: string;
  onFocus: (id: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const base = e.base + "/dependencies",
    nodes = new Map<string, MapNode>(),
    edges: Edge[] = [];
  const matchingRisks = risks.filter((r) =>
    projects.some((p) =>
      r.evidence.some((line) =>
        [p.name, p.owner, p.client].some((n) => n && line.includes(n)),
      ),
    ),
  );
  const columns = [
    [...new Set(projects.map((p) => p.client).filter(Boolean))],
    projects.map((p) => p.id),
    [...new Set(projects.map((p) => p.owner).filter(Boolean))],
    matchingRisks.map((r) => r.id),
  ];
  const height = Math.max(
    420,
    Math.max(...columns.map((c) => c.length)) * 126 + 110,
  );
  const y = (col: number, key: string) =>
    80 +
    (columns[col].indexOf(key) + 0.5) *
      ((height - 110) / Math.max(1, columns[col].length)) -
    40;
  for (const p of projects) {
    const client = "client-" + slug(p.client),
      project = "project-" + p.id,
      person = "person-" + slug(p.owner);
    if (p.client)
      nodes.set(client, {
        id: client,
        name: p.client,
        kind: "Client",
        sub: "Client account",
        x: 32,
        y: y(0, p.client),
        href: e.link(base + "/" + client, e.origin),
        evidence: `Client account connected to ${projects.filter((v) => v.client === p.client).length} project(s) in these records.`,
      });
    nodes.set(project, {
      id: project,
      name: p.name,
      kind: "Project",
      sub: p.status,
      attention: p.status !== "On track",
      x: 304,
      y: y(1, p.id),
      href: e.link(base + "/" + project, e.origin),
      evidence: p.evidence,
    });
    if (p.owner)
      nodes.set(person, {
        id: person,
        name: p.owner,
        kind: "Person",
        sub: "Accountable owner",
        x: 576,
        y: y(2, p.owner),
        href: e.link(base + "/" + person, e.origin),
        evidence: `Recorded delivery owner for ${projects
          .filter((v) => v.owner === p.owner)
          .map((v) => v.name)
          .join(", ")}.`,
      });
    if (p.client)
      edges.push({
        id: p.id + "-client",
        from: client,
        to: project,
        project: p.id,
        label: "Delivery",
        attention: p.status !== "On track",
      });
    if (p.owner)
      edges.push({
        id: p.id + "-owner",
        from: project,
        to: person,
        project: p.id,
        label: "Owner",
        attention: p.status !== "On track",
      });
    for (const r of matchingRisks.filter((r) =>
      r.evidence.some((line) =>
        [p.name, p.owner, p.client].some((n) => n && line.includes(n)),
      ),
    )) {
      const id = "signal-" + r.id;
      nodes.set(id, {
        id,
        name: r.title,
        kind: "Signal",
        sub: r.severity + " priority",
        x: 848,
        y: y(3, r.id),
        attention: true,
        href: e.link(e.base + "/actions/" + r.id, e.origin),
        evidence: r.impact,
      });
      edges.push({
        id: p.id + "-" + r.id,
        from: person,
        to: id,
        project: p.id,
        label: "Exposure",
        attention: true,
      });
    }
  }
  const selected =
    nodes.get(focus) ||
    nodes.get("project-" + projects.find((p) => p.status !== "On track")?.id) ||
    [...nodes.values()][0];
  const active = hover || (nodes.has(focus) ? focus : "");
  const connected = new Set<string>(active ? [active] : []);
  if (active) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of edges) {
        if (connected.has(edge.from) || connected.has(edge.to)) {
          for (const id of [edge.from, edge.to]) {
            if (!connected.has(id)) {
              connected.add(id);
              changed = true;
            }
          }
        }
      }
    }
  }
  return (
    <div className="dep-map">
      <div className="dep-map-caption">
        <span>
          <span className="dep-live-dot" />
          Relationship map
        </span>
        <span>
          {nodes.size} entities <i /> {edges.length} connections
        </span>
      </div>
      <div
        className="dep-canvas"
        style={{ width: 1088 * zoom, height: height * zoom }}
      >
        <div
          className="dep-plane"
          style={{ width: 1088, height, transform: `scale(${zoom})` }}
        >
          <div className="dep-lanes">
            {["Clients", "Projects", "People", "Risk signals"].map(
              (label, index) => (
                <div key={label}>
                  <span>0{index + 1}</span>
                  {label}
                  <small>{columns[index].length}</small>
                </div>
              ),
            )}
          </div>
          <svg
            className="dep-wires"
            width="1088"
            height={height}
            aria-label="Directed relationships between clients, projects, people and recorded risk signals"
          >
            <defs>
              <marker
                id="dep-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#a99bbf" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const a = nodes.get(edge.from)!,
                b = nodes.get(edge.to)!,
                x1 = a.x + 208,
                y1 = a.y + 40,
                x2 = b.x,
                y2 = b.y + 40;
              const highlighted =
                connected.has(edge.from) && connected.has(edge.to);
              return (
                <Link
                  key={edge.id}
                  to={e.link(base + "/relationship/" + edge.project, e.origin)}
                  aria-label={`Explain ${projects.find((p) => p.id === edge.project)?.name} ${edge.label.toLowerCase()} relationship`}
                  className={`dep-wire ${highlighted ? "is-lit" : ""} ${edge.attention ? "is-attention" : ""}`}
                >
                  <path
                    className="dep-wire-hit"
                    d={`M${x1},${y1} C${x1 + 34},${y1} ${x2 - 34},${y2} ${x2},${y2}`}
                  />
                  <path
                    className="dep-wire-line"
                    d={`M${x1},${y1} C${x1 + 34},${y1} ${x2 - 34},${y2} ${x2},${y2}`}
                    markerEnd="url(#dep-arrow)"
                  />
                  <title>
                    {edge.label}: {a.name} → {b.name}
                  </title>
                </Link>
              );
            })}
          </svg>
          {[...nodes.values()].map((n) => {
            const Icon = icons[n.kind];
            return (
              <div
                key={n.id}
                className={`dep-node ${n.kind.toLowerCase()} ${n.attention ? "has-attention" : ""} ${active === n.id ? "is-selected" : ""} ${active && !connected.has(n.id) ? "is-dimmed" : ""}`}
                style={{ left: n.x, top: n.y }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
              >
                <Link
                  to={n.href}
                  aria-label={`${n.kind} ${n.name}`}
                  onFocus={() => setHover(n.id)}
                  onBlur={() => setHover(null)}
                >
                  <span className="dep-node-icon">
                    <Icon size={17} strokeWidth={1.6} />
                  </span>
                  <span className="dep-node-copy">
                    <small>{n.kind}</small>
                    <strong>{n.name}</strong>
                    <span className="dep-node-status">
                      <i />
                      {n.sub}
                    </span>
                  </span>
                </Link>
                <button
                  className="dep-focus"
                  title={`Focus ${n.name}`}
                  aria-label={`Focus ${n.name}`}
                  aria-pressed={focus === n.id}
                  onClick={() => onFocus(n.id)}
                >
                  <Crosshair size={13} />
                </button>
              </div>
            );
          })}
          {!matchingRisks.length && (
            <div
              className="dep-no-signals"
              style={{ left: 848, top: height / 2 - 25 }}
            >
              <ShieldAlert size={20} />
              <span>No linked risks recorded</span>
            </div>
          )}
        </div>
      </div>
      {selected && (
        <div className="dep-inspector" aria-live="polite">
          <span
            className={`dep-inspector-icon ${selected.attention ? "attention" : ""}`}
          >
            {(() => {
              const Icon = icons[selected.kind];
              return <Icon size={18} />;
            })()}
          </span>
          <div>
            <span>
              {selected.kind} <b>·</b> {selected.sub}
            </span>
            <h3>{selected.name}</h3>
            <p>{selected.evidence}</p>
          </div>
          <Link to={selected.href}>
            Open {selected.kind === "Signal" ? "action" : "details"}
            <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <div className="dep-map-footer">
        <span>
          <MousePointer2 size={12} /> Hover to trace · select a connection to
          inspect · focus a node for context
        </span>
        <div>
          <span>
            <i />
            Connected
          </span>
          <span>
            <i />
            Needs attention
          </span>
        </div>
      </div>
    </div>
  );
}
