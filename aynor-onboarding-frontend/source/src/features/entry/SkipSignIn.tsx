import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../lib/context";
import { prototype } from "../../lib/mockService";
export function SkipSignIn({
  label = "Skip for now",
  className = "",
  destination = "/entry",
}: {
  label?: string;
  className?: string;
  destination?: string;
}) {
  const { setUser, toast } = useApp();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={"skip-signin " + className}
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          const r = await prototype.guest();
          setUser(r.user);
          nav(destination);
        } catch (e) {
          toast((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Opening your preview…" : label}
      <ArrowRight size={13} />
    </button>
  );
}
