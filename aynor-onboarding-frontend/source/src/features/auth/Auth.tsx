import { SkipSignIn } from "../entry/SkipSignIn";
import { prototype } from "../../lib/mockService";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Compass,
  Users,
  BarChart3,
  BriefcaseBusiness,
  CircleUserRound,
  Globe2,
  Link2,
  LockKeyhole,
  Mail,
  MoreHorizontal,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button, ErrorBox, Field, Logo, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import { useApp } from "../../lib/context";
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";

export function BrandPanel() {
  return (
    <aside className="brand-panel reference-brand">
      <div className="reference-brand-heading">
        <div className="page-kicker">THE EXECUTIVE PERSPECTIVE</div>
        <h2>
          Understand more.
          <br />
          Decide better.
        </h2>
        <p>
          See the connections. Find your focus.
          <br />
          One intelligent workspace for every business you lead.
        </p>
      </div>
      <div
        className="connected-art"
        aria-label="Original illustrative artwork: connected business signals converge into one clear perspective"
      >
        <div className="tile-field">
          {Array.from({ length: 12 }, (_, i) => (
            <div className={"glass-tile tile-" + i} key={i}>
              {i === 5 ? (
                <div className="intelligence-core">
                  <Sparkles size={38} strokeWidth={1.3} />
                </div>
              ) : i === 2 ? (
                <BarChart3 size={23} />
              ) : i === 8 ? (
                <BriefcaseBusiness size={23} />
              ) : i === 6 ? (
                <Users size={23} />
              ) : null}
            </div>
          ))}
        </div>
        <div className="connection-trace trace-a" />
        <div className="connection-trace trace-b" />
        <div className="connection-trace trace-c" />
      </div>
      <div className="brand-signal-stack">
        <div className="signal-stack-label">
          <span>EVERY SIGNAL. A CLEARER PICTURE.</span>
          <span>ILLUSTRATIVE PREVIEW</span>
        </div>
        {[
          {
            icon: BarChart3,
            title: "Your business, in context.",
            text: "Connect performance across departments.",
            status: "Connected",
          },
          {
            icon: Link2,
            title: "Clarity in the connections.",
            text: "See how one change shapes the bigger picture.",
            status: "In focus",
          },
          {
            icon: Compass,
            title: "A confident next move.",
            text: "Know where to turn your attention.",
            status: "Ready",
          },
        ].map((row, i) => (
          <div className={"brand-signal-row row-" + i} key={row.title}>
            <span className="brand-signal-icon">
              <row.icon size={19} strokeWidth={1.5} />
            </span>
            <div>
              <strong>{row.title}</strong>
              <p>{row.text}</p>
            </div>
            <span className="brand-signal-status">
              {row.status}
              <i />
            </span>
          </div>
        ))}
      </div>
      <div className="reference-brand-footer">
        <span>CLARITY. CONTEXT. CONFIDENCE.</span>
        <span>AYNOR / 01</span>
      </div>
    </aside>
  );
}

export function Auth({ mode: initial }: { mode?: string }) {
  const params = useParams();
  const mode = initial || params.mode || "signup";
  const { user, setUser, development, toast } = useApp();
  const nav = useNavigate(),
    loc = useLocation();
  const [oauth, setOauth] = useState(false);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(
      user?.id === "onboarding-guest" ? "" : user?.email || "",
    ),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(
      new URLSearchParams(loc.search).get("token") ||
        sessionStorage.getItem("aynor-dev-challenge") ||
        "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false),
    [cooldown, setCooldown] = useState(0),
    [legal, setLegal] = useState("");
  const next = new URLSearchParams(loc.search).get("next");
  const safeNext = next?.startsWith("/invite/") ? next : "/entry";
  const link = (m: string) =>
    "/auth/" + m + (next ? "?next=" + encodeURIComponent(next) : "");
  useEffect(() => {
    setError("");
    setSent(false);
    setPassword("");
    if (mode === "verify")
      setToken(sessionStorage.getItem("aynor-dev-challenge") || "123456");
    if (mode === "reset-password")
      setToken(new URLSearchParams(loc.search).get("token") || "");
  }, [mode]);
  useEffect(() => {
    if (cooldown) {
      const t = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [cooldown]);
  if (
    user?.verified &&
    user.id !== "onboarding-guest" &&
    ["signup", "login"].includes(mode)
  )
    return <Navigate to={safeNext} replace />;
  const titles: Record<string, string> = {
    signup: "Create your account",
    login: "Welcome back.",
    verify: "One quick check.",
    "forgot-password": "Let’s get you back.",
    "reset-password": "A fresh start.",
  };
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        const r = await api("/auth/signup", "POST", { name, email, password });
        setUser(r.user);
        if (r.developmentToken) {
          sessionStorage.setItem("aynor-dev-challenge", r.developmentToken);
          setToken(r.developmentToken);
        }
        nav(link("verify"));
      } else if (mode === "login") {
        const r = await api("/auth/login", "POST", { email, password });
        setUser(r.user);
        nav(r.user.verified ? safeNext : link("verify"));
      } else if (mode === "verify") {
        const r = await api("/auth/verify", "POST", { token });
        setUser(r.user);
        sessionStorage.removeItem("aynor-dev-challenge");
        nav(safeNext);
      } else if (mode === "forgot-password") {
        const r = await api("/auth/recover", "POST", { email });
        if (r.developmentToken) setToken(r.developmentToken);
        setSent(true);
      } else {
        await api("/auth/reset", "POST", { token, password });
        setUser(null);
        toast(
          "Sample password reset complete. Sign in to continue. No password was saved.",
        );
        nav(link("login"));
      }
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setBusy(true);
    setError("");
    try {
      const r = await api("/auth/resend", "POST");
      if (r.developmentToken) {
        setToken(r.developmentToken);
        sessionStorage.setItem("aynor-dev-challenge", r.developmentToken);
      }
      setCooldown(60);
      toast(
        development
          ? "A new sample verification code is ready: 123456."
          : "Verification email requested.",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-canvas">
      <div className="auth-frame">
        <section className="auth-left">
          <header className="auth-header">
            <Link to="/home" aria-label="Aynor home">
              <Logo />
            </Link>
            <span>
              {mode === "signup" ? (
                <>
                  Already a member?{" "}
                  <Link to={link("login")}>
                    Log in <ArrowUpRight size={12} />
                  </Link>
                </>
              ) : (
                <>
                  New to Aynor?{" "}
                  <Link to={link("signup")}>
                    Get started <ArrowUpRight size={12} />
                  </Link>
                </>
              )}
            </span>
          </header>
          <div className="auth-body">
            <div className="account-icon">
              {mode === "verify" ? (
                <Mail size={22} />
              ) : mode.includes("password") ? (
                <LockKeyhole size={22} />
              ) : (
                <CircleUserRound size={24} />
              )}
            </div>
            <h1>{titles[mode] || titles.login}</h1>
            <p className="auth-subtitle">
              {mode === "signup" ? (
                "Your business intelligence starts here."
              ) : mode === "login" ? (
                "Your companies. Your intelligence."
              ) : mode === "verify" ? (
                <>
                  Verify your email to create your workspace.
                  <br />
                  <span className="masked-email">
                    {user?.email.replace(/^(.{2}).*(@.*)$/, "$1••••$2")}
                  </span>
                </>
              ) : mode === "forgot-password" ? (
                "A little help getting back to what matters."
              ) : (
                "Choose a strong password for your account."
              )}
            </p>
            {["signup", "login"].includes(mode) && (
              <>
                <button
                  className="google-button"
                  onClick={() => setOauth(true)}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.6a4.8 4.8 0 0 1-2.1 3.2v2.6h3.4c2-1.8 3.1-4.5 3.1-7.7Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H2.7v2.7A10.4 10.4 0 0 0 12 22Z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M6.2 13.7a6.2 6.2 0 0 1 0-3.4V7.6H2.7a10 10 0 0 0 0 8.8l3.5-2.7Z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 6.1c1.5 0 2.9.5 4 1.6l3-3A10 10 0 0 0 2.7 7.6l3.5 2.7C7 7.9 9.3 6.1 12 6.1Z"
                    />
                  </svg>
                  Continue with Google
                </button>
                <div className="divider">
                  <span>or continue with email</span>
                </div>
              </>
            )}
            {next?.includes("prototype-invitation") && (
              <div className="dev-note">
                <Mail size={16} />
                <span>
                  Sample invitation for guest@aynor.example. Create a prototype
                  account with this address to explore the invited-user journey.
                </span>
              </div>
            )}
            <ErrorBox>{error}</ErrorBox>
            {sent ? (
              <div className="recovery-confirm">
                <ShieldCheck size={28} />
                <h3>Check your inbox</h3>
                <p>
                  If an account exists, you’ll receive a reset link. In this
                  prototype, open the sample link below. Email delivery is
                  unavailable in this environment.
                </p>
                {development && token && (
                  <Link
                    className="button"
                    to={"/auth/reset-password?token=" + token}
                  >
                    Open sample reset link <ArrowRight size={16} />
                  </Link>
                )}
                <Link className="text-button" to={link("login")}>
                  Return to sign in
                </Link>
              </div>
            ) : (
              <form onSubmit={submit}>
                {mode === "signup" && (
                  <Field
                    label="Full name"
                    autoComplete="name"
                    placeholder="e.g. Alex Morgan"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                  />
                )}
                {["signup", "login", "forgot-password"].includes(mode) && (
                  <Field
                    label="Email address"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
                {["signup", "login", "reset-password"].includes(mode) && (
                  <>
                    <div className="password-heading">
                      {mode === "login" && (
                        <Link to={link("forgot-password")}>
                          Forgot password?
                        </Link>
                      )}
                    </div>
                    <Field
                      label="Password"
                      type="password"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      placeholder={
                        mode === "login"
                          ? "Enter your password"
                          : "Create a strong password"
                      }
                      required
                      minLength={mode === "login" ? 1 : 10}
                      maxLength={200}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      hint={
                        mode === "login"
                          ? undefined
                          : "At least 10 characters. Make it uniquely yours."
                      }
                    />
                  </>
                )}
                {mode === "verify" && (
                  <>
                    <Field
                      label="Verification code"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      required
                      placeholder="Enter your verification code"
                    />
                    {development && (
                      <div className="dev-note">
                        <ShieldCheck size={16} />
                        <span>
                          Prototype verification. Use 123456. No email is sent.
                        </span>
                      </div>
                    )}
                  </>
                )}
                {mode === "reset-password" && !token && (
                  <Field
                    label="Reset code"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                )}
                <Button
                  className="full-width auth-submit"
                  busy={busy}
                  type="submit"
                >
                  {mode === "signup"
                    ? "Create account"
                    : mode === "login"
                      ? "Sign in"
                      : mode === "verify"
                        ? "Verify email"
                        : mode === "forgot-password"
                          ? "Send reset link"
                          : "Update password"}
                  <ArrowRight size={16} />
                </Button>
                {mode === "signup" && (
                  <p className="terms-note">
                    By continuing, you agree to our{" "}
                    <button
                      type="button"
                      onClick={() => setLegal("Terms of Service")}
                    >
                      Terms of Service
                    </button>
                    <br />
                    and{" "}
                    <button
                      type="button"
                      onClick={() => setLegal("Privacy Policy")}
                    >
                      Privacy Policy
                    </button>
                    .
                  </p>
                )}
                {mode === "verify" && (
                  <div className="auth-secondary">
                    <Button
                      type="button"
                      variant="text"
                      disabled={cooldown > 0}
                      busy={busy}
                      onClick={resend}
                    >
                      {cooldown
                        ? `Resend in ${cooldown}s`
                        : "Resend verification"}
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      onClick={async () => {
                        await api("/auth/logout", "POST");
                        setUser(null);
                        nav("/auth/signup");
                      }}
                    >
                      Use a different email
                    </Button>
                  </div>
                )}
                {mode.includes("password") && (
                  <Link className="back-link" to={link("login")}>
                    <ArrowLeft size={14} /> Back to sign in
                  </Link>
                )}
              </form>
            )}
            {["login", "signup"].includes(mode) && (
              <SkipSignIn label="Skip for now · continue to onboarding" />
            )}
            <div className="auth-trust">
              <ShieldCheck size={14} />
              <span>Explore your workspace at your own pace.</span>
            </div>
          </div>
          <footer className="auth-footer">
            <span>© {new Date().getFullYear()} Aynor</span>
            <button onClick={() => setLegal("Help & support")}>
              Need a hand? <ArrowUpRight size={12} />
            </button>
            <span className="footer-language">
              <Globe2 size={12} /> English
            </span>
          </footer>
        </section>
        <BrandPanel />
      </div>
      {oauth && (
        <Modal title="Continue with Google" onClose={() => setOauth(false)}>
          <div className="dev-note">
            <ShieldCheck size={16} />
            <span>Simulated sign-in. No Google account is connected.</span>
          </div>
          <button
            className="sample-account"
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api("/auth/google", "POST");
                setUser(r.user);
                setOauth(false);
                nav(safeNext);
              } catch (e) {
                setError(message(e));
                setOauth(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="avatar">A</span>
            <span>
              <strong>Alex Morgan</strong>
              <small>alex@aynor.example · Sample account</small>
            </span>
            <ArrowRight size={16} />
          </button>
          <Button
            variant="text"
            onClick={() => {
              setOauth(false);
              toast("Google sign-in cancelled. You can continue with email.");
            }}
          >
            Cancel sign-in
          </Button>
        </Modal>
      )}
      {legal && (
        <Modal title={legal} onClose={() => setLegal("")}>
          <p>
            {legal === "Help & support"
              ? "Explore a sample workspace or create a prototype account. Verification uses 123456. All sign-ins, connections, and email actions are simulated locally."
              : legal === "Privacy Policy"
                ? "Frontend prototype: sample company data and profile details stay in this browser. Passwords are discarded and never saved. No backend, Google account, or email service is contacted. Use fictional information only."
                : "This is an interactive design prototype for evaluation. All integrations, email delivery, and authentication are simulated. No actual business intelligence or production access is provided."}
          </p>
          <Button onClick={() => setLegal("")}>Understood</Button>
        </Modal>
      )}
    </main>
  );
}
