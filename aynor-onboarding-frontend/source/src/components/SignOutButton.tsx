import { useState } from "react";
import { LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../lib/context";
import { serverMode } from "../lib/runtime";
import { Button } from "./ui";

export function SignOutButton({
  compact = false,
  className = "",
}: {
  compact?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const { setUser, toast } = useApp();
  const nav = useNavigate();
  return (
    <Button
      type="button"
      variant="text"
      className={"sign-out-button " + className}
      aria-label="Log out"
      title="Log out"
      busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api("/auth/logout", "POST");
          try {
            if (serverMode) {
              for (const key of Object.keys(sessionStorage))
                if (key.startsWith("aynor")) sessionStorage.removeItem(key);
            }
          } catch {
            /* Server logout succeeds even if storage is blocked. */
          }
          setUser(null);
          window.dispatchEvent(new Event("aynor:signed-out"));
          try {
            if ("BroadcastChannel" in window) {
              const channel = new BroadcastChannel("aynor:auth");
              channel.postMessage("signed-out");
              channel.close();
            }
          } catch {
            /* This tab is already signed out. */
          }
          nav("/auth/login", { replace: true });
        } catch (error) {
          toast(
            error instanceof Error
              ? error.message
              : "Could not log out. Please retry.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <LogOut size={16} />
      {!compact && <span>Log out</span>}
    </Button>
  );
}
