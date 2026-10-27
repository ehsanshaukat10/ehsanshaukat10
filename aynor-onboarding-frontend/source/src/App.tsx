import { serverMode } from "./lib/runtime";
import { Home } from "./features/home/Home";
import { Entry } from "./features/entry/Entry";
import { ScreenGallery } from "./features/preview/ScreenGallery";
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
let boot: Promise<any> | null = null;
function initialize() {
  if (!boot)
    boot = Promise.all([api("/session"), api("/config")])
      .then(async ([session, config]) => {
        if (serverMode && !session.user && config.developmentSession)
          session = await api("/dev/session", "POST");
        return [session, config];
      })
      .catch((error) => {
        boot = null;
        throw error;
      });
  return boot;
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [development, setDevelopment] = useState(false),
    [toast, setToast] = useState(""),
    [error, setError] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    initialize()
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
        <Route path="/" element={<Home />} />
        <Route path="/home" element={<Home />} />
        <Route
          path="/entry"
          element={
            <Guard>
              <Entry />
            </Guard>
          }
        />
        <Route path="/prototype" element={<ScreenGallery />} />
        <Route path="/welcome" element={<Home />} />
        <Route path="/auth" element={<Navigate to="/auth/signup" replace />} />
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
        {[
          "departments",
          "dependencies",
          "goals",
          "actions",
          "ask",
          "settings",
        ].map((module) => (
          <Route
            key={module}
            path={`/companies/:id/${module}/*`}
            element={
              <Guard>
                <Workspace intelligence />
              </Guard>
            }
          />
        ))}
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
        to={
          "/auth/signup?next=" +
          encodeURIComponent(loc.pathname + loc.search + loc.hash)
        }
        replace
      />
    );
  if (!user.verified)
    return (
      <Navigate
        to={
          "/auth/verify?next=" +
          encodeURIComponent(loc.pathname + loc.search + loc.hash)
        }
        replace
      />
    );
  return children;
}
