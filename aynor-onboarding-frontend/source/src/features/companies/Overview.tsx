import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  Compass,
  FileSpreadsheet,
  Link2,
  Sparkles,
  Target,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Empty, ErrorBox, Modal } from "../../components/ui";
import { api, type Company, type WorkspaceData } from "../../lib/api";
import { useApp } from "../../lib/context";
import { wizardUrl } from "../wizard/progress";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";

export function Overview({
  company,
}: {
  company: Company;
  save: (d: WorkspaceData) => Promise<boolean | undefined>;
}) {
  const { data } = company;
  const editable = ["Owner", "Admin"].includes(company.role);
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(""),
    [error, setError] = useState("");
  const { toast } = useApp();
  const d = company.data;
  return (
    <>
      <div className="page-kicker">
        <span className="tiny-blue-dot" /> THE EXECUTIVE PERSPECTIVE
      </div>
      <div className="page-title-row">
        <div>
          <h1>
            A clearer picture<span className="accent">.</span>
          </h1>
          <p>
            {company.name} ·{" "}
            {new Intl.DateTimeFormat("en", {
              dateStyle: "long",
              timeZone: company.timezone,
            }).format(new Date())}
          </p>
        </div>
        {editable && (
          <Link
            className="button secondary"
            to={
              data.completed
                ? `/companies/${company.id}/settings/setup`
                : wizardUrl(company)
            }
          >
            {data.completed ? "Workspace settings" : "Resume setup"}{" "}
            <ArrowRight size={15} />
          </Link>
        )}
      </div>
      <div className="overview-banner">
        <div className="overview-banner-icon">
          <Compass size={25} />
        </div>
        <div>
          <Badge tone="warning">LIMITED WORKSPACE</Badge>
          <h2>Your company. Ready for more clarity.</h2>
          <p>
            No live business data is connected.{" "}
            {data.demo
              ? "Sample structures are configured; they do not reflect company performance."
              : "Connect a source to unlock evidence-backed intelligence."}
          </p>
        </div>
        {editable && (
          <Link to={`/companies/${company.id}/settings/setup/integrations`}>
            Connect your data <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
      <div className="overview-stats">
        {[
          ["Departments", String(data.departments?.length || 0), Building2],
          ["Live sources", "0", FileSpreadsheet],
          ["Configured goals", String(data.goals?.length || 0), Target],
          [
            "Confirmed mappings",
            String(
              data.mappings?.filter((m) => m.confirmed && !m.ignored).length ||
                0,
            ),
            Link2,
          ],
        ].map(([label, value, Icon]) => {
          const I = Icon as typeof Building2;
          return (
            <div className="stat-card" key={String(label)}>
              <span>
                {String(label)}
                <I size={17} />
              </span>
              <strong>{String(value)}</strong>
              <small>
                {label === "Live sources"
                  ? "Awaiting connection"
                  : "Workspace configuration"}
              </small>
            </div>
          );
        })}
      </div>
      <div className="overview-grid">
        <section className="overview-intelligence">
          <div className="section-line">
            <h3>
              <Sparkles size={17} /> Executive intelligence
            </h3>
            <Badge>Awaiting data</Badge>
          </div>
          <Empty
            title="Good decisions begin with good data."
            description="Once a live source is connected and validated, your company’s signals, risks, and recommendations will appear here."
            action={
              editable ? (
                <Link
                  className="button secondary"
                  to={`/companies/${company.id}/settings/setup/integrations`}
                >
                  Set up a data source <ArrowUpRight size={15} />
                </Link>
              ) : undefined
            }
          />
        </section>
        <section className="overview-priorities">
          <div className="section-line">
            <h3>Your business priorities</h3>
            {editable && (
              <Link
                to={`/companies/${company.id}/settings/setup/priorities`}
                aria-label="Edit business priorities"
              >
                <ArrowUpRight size={16} />
              </Link>
            )}
          </div>
          {data.priorities?.length ? (
            data.priorities.map((p, i) => (
              <div className="priority-line" key={p}>
                <span>0{i + 1}</span>
                {p}
                <Target size={14} />
              </div>
            ))
          ) : (
            <Empty
              title="Your focus starts here."
              description={
                editable
                  ? "Choose what matters most to your company."
                  : "An administrator can configure business priorities."
              }
            />
          )}
        </section>
      </div>
      {data.goals?.length > 0 && (
        <section className="overview-goals">
          <h3>A direction worth measuring</h3>
          {data.goals.map((g) => (
            <div className="goal-row" key={g.id}>
              <Target size={19} />
              <div>
                <h3>{g.name}</h3>
                <p>
                  Target {g.target} · Due {g.deadline}
                </p>
              </div>
              <Badge>Awaiting valid data</Badge>
            </div>
          ))}
        </section>
      )}
      <div className="workspace-management">
        <Link to="/companies">
          Manage companies <ArrowUpRight size={13} />
        </Link>
        {company.role === "Owner" ? (
          <button onClick={() => setConfirm("archive")}>Archive company</button>
        ) : (
          <button onClick={() => setConfirm("leave")}>Leave company</button>
        )}
      </div>
      {confirm && (
        <Modal
          title={
            confirm === "archive"
              ? "Archive this company?"
              : "Leave this company?"
          }
          onClose={() => setConfirm("")}
        >
          <p>
            {confirm === "archive"
              ? "This hides this company in the prototype. Reset sample data to restore the original sample companies. No real company is affected."
              : "You will lose access to this workspace. You will need a new invitation to return."}
          </p>
          <ErrorBox>{error}</ErrorBox>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setConfirm("")}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await api(`/companies/${company.id}/${confirm}`, "POST");
                  toast(
                    confirm === "archive"
                      ? "Company archived."
                      : "You left the company.",
                  );
                  nav("/companies");
                } catch (e) {
                  setError(message(e));
                }
              }}
            >
              Confirm {confirm}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
