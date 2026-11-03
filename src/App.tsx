import { ScreenGallery, FlowNavigator } from "./features/preview/ScreenGallery";
import { PrototypeTools } from "./components/PrototypeTools";
import { CheckCheck, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Button, ErrorBox, Logo } from "./components/ui";
import { Auth } from "./features/auth/Auth";
import { Companies, NewCompany } from "./features/companies/Companies";
import { Invitation } from "./features/team/Team";
import { Workspace } from "./features/workspace/Workspace";
import { api, type User } from "./lib/api";
import { Context, useApp } from "./lib/context";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [development, setDevelopment] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    Promise.all([api("/session"), api("/config")])
      .then(([s, c]) => {
        setUser(s.user);
        setDevelopment(c.development);
        setReady(true);
      })
      .catch((e) => setError(message(e)));
    const expire = () => {
      setUser(null);
      setToast("Your session expired. Sign in to continue.");
      nav("/auth/login");
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  if (error)
    return (
      <div className="boot">
        <Logo />
        <ErrorBox>{error}</ErrorBox>
        <Button onClick={() => location.reload()}>Retry connection</Button>
      </div>
    );
  if (!ready)
    return (
      <div className="boot">
        <Logo />
        <span className="loading-line" />
        <p>Preparing your workspace…</p>
      </div>
    );
  return (
    <Context.Provider value={{ user, setUser, development, toast: setToast }}>
      <Routes>
        <Route path="/" element={<Navigate to="/prototype" replace />} />
        <Route path="/prototype" element={<ScreenGallery />} />
        <Route path="/welcome" element={<Auth mode="signup" />} />
        <Route path="/auth/:mode" element={<Auth />} />
        <Route
          path="/companies"
          element={
            <Guard>
              <Companies />
            </Guard>
          }
        />
        <Route
          path="/companies/new"
          element={
            <Guard>
              <NewCompany />
            </Guard>
          }
        />
        <Route
          path="/companies/:id/onboarding/:step"
          element={
            <Guard>
              <Workspace />
            </Guard>
          }
        />
        <Route
          path="/companies/:id/overview"
          element={
            <Guard>
              <Workspace overview />
            </Guard>
          }
        />
        <Route
          path="/companies/:id/settings/members"
          element={
            <Guard>
              <Workspace members />
            </Guard>
          }
        />
        <Route
          path="/invite/:token"
          element={
            <Guard>
              <Invitation />
            </Guard>
          }
        />
        <Route
          path="*"
          element={
            <div className="boot">
              <Logo />
              <h1>This page has moved.</h1>
              <Link to="/">Return to AYNOR →</Link>
            </div>
          }
        />
      </Routes>
      <FlowNavigator />
      <PrototypeTools />
      {toast && (
        <div className="toast" role="status">
          <CheckCheck size={18} />
          {toast}
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
function Guard({ children }: { children: ReactNode }) {
  const { user } = useApp();
  const loc = useLocation();
  if (!user)
    return (
      <Navigate
        to={"/auth/login?next=" + encodeURIComponent(loc.pathname)}
        replace
      />
    );
  if (!user.verified)
    return (
      <Navigate
        to={"/auth/verify?next=" + encodeURIComponent(loc.pathname)}
        replace
      />
    );
  return children;
}
