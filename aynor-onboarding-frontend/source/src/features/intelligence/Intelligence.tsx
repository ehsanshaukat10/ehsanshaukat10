import { useLocation } from "react-router-dom";
import { Departments } from "./Departments";
import { Dependencies } from "./Dependencies";
import { Goals } from "./Goals";
import { Actions } from "./Actions";
import { Ask } from "./Ask";
import { Settings } from "./Settings";
import type { ModuleProps } from "./shared";
import "./intelligence.css";
export function Intelligence(props: ModuleProps) {
  const location = useLocation(),
    module = location.pathname.split("/")[3],
    Component =
      module === "departments"
        ? Departments
        : module === "dependencies"
          ? Dependencies
          : module === "goals"
            ? Goals
            : module === "actions"
              ? Actions
              : module === "ask"
                ? Ask
                : Settings;
  return <Component key={location.pathname} {...props} />;
}
