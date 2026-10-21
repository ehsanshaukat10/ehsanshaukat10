import {
  ArrowUpRight,
  CircleHelp,
  FlaskConical,
  RefreshCw,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../lib/context";
import { prototype } from "../lib/mockService";
import { Button, Modal } from "./ui";

/** Optional preview controls, deliberately separate from the product navigation. */
export function PrototypeTools() {
  const [open, setOpen] = useState(false),
    [reset, setReset] = useState(false);
  const { setUser, toast } = useApp();
  const nav = useNavigate();
  const location = useLocation();
  if (
    location.pathname.includes("/onboarding/") ||
    location.pathname.startsWith("/auth/") ||
    location.pathname.startsWith("/invite/") ||
    location.pathname === "/welcome" ||
    location.pathname === "/companies/new"
  )
    return null;
  return (
    <div className="prototype-tools">
      <button
        className="prototype-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <FlaskConical size={13} /> Prototype <span>⌃</span>
      </button>
      {open && (
        <section
          className="prototype-popover"
          aria-label="Prototype preview controls"
        >
          <div className="section-line">
            <h3>Explore the experience.</h3>
            <button
              className="icon-button"
              aria-label="Close prototype controls"
              onClick={() => setOpen(false)}
            >
              <X size={15} />
            </button>
          </div>
          <p>
            A frontend-only preview. All data and interactions stay in your
            browser.
          </p>
          <Link
            className="button secondary"
            to="/prototype"
            onClick={() => setOpen(false)}
          >
            Browse all 23 onboarding screens <ArrowUpRight size={13} />
          </Link>
          <Button
            variant="secondary"
            onClick={async () => {
              const r = await prototype.explore();
              setUser(r.user);
              nav("/companies");
              setOpen(false);
            }}
          >
            Open sample companies <ArrowUpRight size={13} />
          </Button>
          <button
            onClick={() => {
              nav(prototype.invitation());
              setOpen(false);
              toast("Sample invitation: use guest@aynor.example.");
            }}
          >
            Invitation entry <ArrowUpRight size={13} />
          </button>
          <div className="preview-state-heading">PREVIEW A RECOVERY STATE</div>
          {[
            { name: "Service error on next action", value: "error" as const },
            { name: "Offline on next action", value: "offline" as const },
            { name: "Slow response on next action", value: "slow" as const },
          ].map((s) => (
            <button
              key={s.value}
              onClick={() => {
                prototype.simulateNext(s.value);
                setOpen(false);
                toast(`${s.name}. Complete any action to preview it.`);
              }}
            >
              <CircleHelp size={13} />
              {s.name}
            </button>
          ))}
          <button
            onClick={() => {
              prototype.expire();
              setOpen(false);
            }}
          >
            Preview expired session <ArrowUpRight size={13} />
          </button>
          <button className="reset-prototype" onClick={() => setReset(true)}>
            <RefreshCw size={12} /> Reset sample data
          </button>
        </section>
      )}
      {reset && (
        <Modal
          title="Start with a fresh perspective?"
          onClose={() => setReset(false)}
        >
          <p>
            This resets only this prototype’s browser data and sample companies.
            No backend or real account is affected.
          </p>
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setReset(false)}>
              Keep exploring
            </Button>
            <Button
              onClick={() => {
                prototype.reset();
                setUser(null);
                nav("/welcome");
                setReset(false);
                setOpen(false);
                toast("Prototype reset. A fresh start.");
              }}
            >
              Reset prototype
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
