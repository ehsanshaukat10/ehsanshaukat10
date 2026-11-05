import { GovernedAsk } from "../live/GovernedAsk";
import { GovernedGoals } from "../live/GovernedGoals";
import { GovernedDependencies } from "../live/GovernedDependencies";
import { serverMode } from "../../lib/runtime";
import { GovernedDepartments } from "../live/GovernedDepartments";
import { GovernedActions } from "../live/GovernedActions";
import { useLocation } from "react-router-dom";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/ui";
import { Departments } from "./Departments";
import { Dependencies } from "./Dependencies";
import { Goals } from "./Goals";
import { Actions } from "./Actions";
import { Ask } from "./Ask";
import { Settings, DataConnections } from "./Settings";
import type { ModuleProps } from "./shared";
import "./intelligence.css";
export function Intelligence(props: ModuleProps) {
  const location = useLocation(),
    module = location.pathname.split("/")[3],
    Component =
      module === "connections"
        ? DataConnections
        : module === "departments"
          ? serverMode
            ? GovernedDepartments
            : Departments
          : module === "dependencies"
            ? serverMode
              ? GovernedDependencies
              : Dependencies
            : module === "goals"
              ? serverMode
                ? GovernedGoals
                : Goals
              : module === "actions"
                ? serverMode
                  ? GovernedActions
                  : Actions
                : module === "ask"
                  ? serverMode
                    ? GovernedAsk
                    : Ask
                  : Settings;
  return (
    <ModuleRecovery
      key={location.pathname + location.search}
      companyId={props.company.id}
      moduleName={module || "workspace"}
    >
      <Component key={location.pathname} {...props} />
    </ModuleRecovery>
  );
}

class ModuleRecovery extends Component<
  {
    companyId: string;
    moduleName: string;
    children: ReactNode;
  },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AYNOR module render failed", {
      module: this.props.moduleName,
      message: error.message,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="intel-page module-recovery" role="alert">
        <h1>Reporting could not be displayed.</h1>
        <p>
          Your connected data is unchanged. Retry this report or return to the
          company overview.
        </p>
        <div className="intel-footer-actions">
          <Button onClick={() => window.location.reload()}>Retry report</Button>
          <Link
            className="button secondary"
            to={`/companies/${this.props.companyId}/overview`}
          >
            Return to Overview
          </Link>
        </div>
      </main>
    );
  }
}
