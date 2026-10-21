import { ArrowUpRight, Check, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import type { Company } from "../../lib/api";
export function SetupChecklist({ company }: { company: Company }) {
  const d = company.data;
  const items = [
    {
      name: "Company profile",
      note: "Update company details and preferences.",
      step: "company",
      done: true,
    },
    {
      name: "Departments",
      note: "Rename, reorder, or refine your company structure.",
      step: "departments",
      done: !!d.departments.length,
    },
    {
      name: "Business priorities",
      note: "Choose what Aynor should keep in focus.",
      step: "priorities",
      done: !!d.priorities.length,
    },
    {
      name: "Data connections",
      note: "Connect sources or update selected workbooks.",
      step: "integrations",
      done: !!d.connected && !!d.sources.length,
    },
    {
      name: "Field mapping",
      note: "Review ambiguous fields when you have data.",
      step: "mapping",
      done:
        !!d.mappings.length &&
        d.mappings.every((m) => m.confirmed || m.ignored),
    },
    {
      name: "Performance metrics",
      note: "Define your reporting metrics.",
      step: "kpis",
      done: !!d.kpis.length,
    },
    {
      name: "Company goals",
      note: "Add targets when you’re ready.",
      step: "goals",
      done: !!d.goals.length,
    },
  ];
  return (
    <>
      <div className="page-kicker">YOUR WORKSPACE, AT YOUR PACE</div>
      <div className="page-title-row">
        <div>
          <h1>Make it yours.</h1>
          <p>
            Optional configuration. A little more clarity, whenever you’re
            ready.
          </p>
        </div>
      </div>
      <section className="setup-checklist">
        {items.map((i) => (
          <Link
            key={i.step}
            to={`/companies/${company.id}/settings/setup/${i.step}`}
          >
            <span className={"checklist-status " + (i.done ? "done" : "")}>
              {i.done ? <Check size={16} /> : <Compass size={16} />}
            </span>
            <div>
              <h3>{i.name}</h3>
              <p>{i.note}</p>
            </div>
            <span>{i.done ? "Configured" : "Set up"}</span>
            <ArrowUpRight size={16} />
          </Link>
        ))}
      </section>
    </>
  );
}
