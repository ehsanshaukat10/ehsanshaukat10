import { GovernedDependencies } from "../live/GovernedDependencies";
import { serverMode } from "../../lib/runtime";
import { GovernedDepartments } from "../live/GovernedDepartments";
import { GovernedActions } from "../live/GovernedActions";
import { useLocation } from "react-router-dom";
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
              ? Goals
              : module === "actions"
                ? serverMode
                  ? GovernedActions
                  : Actions
                : module === "ask"
                  ? Ask
                  : Settings;
  return <Component key={location.pathname} {...props} />;
}
