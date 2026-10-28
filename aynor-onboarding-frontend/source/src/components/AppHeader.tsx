import { Link } from "react-router-dom";
import { useApp } from "../lib/context";
import { Logo } from "./ui";
import { SignOutButton } from "./SignOutButton";
import { serverMode } from "../lib/runtime";
export function AppHeader() {
  const { user } = useApp();
  return (
    <header className="app-header">
      <Link to="/companies">
        <Logo />
      </Link>
      <div className="header-middle">
        <span className="header-separator" />
        Your executive workspace
      </div>
      <div className="header-actions">
        {!serverMode && <span className="development-pill">PROTOTYPE</span>}
        <span className="avatar" title={user?.name}>
          {user?.name.charAt(0)}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
