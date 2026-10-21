import { LogOut } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../lib/context";
import { Logo } from "./ui";
export function AppHeader() {
  const { user, setUser } = useApp();
  const nav = useNavigate();
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
        <span className="development-pill">PROTOTYPE</span>
        <span className="avatar" title={user?.name}>
          {user?.name.charAt(0)}
        </span>
        <button
          className="icon-button"
          title="Sign out"
          aria-label="Sign out"
          onClick={async () => {
            await api("/auth/logout", "POST");
            setUser(null);
            nav("/auth/login");
          }}
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
