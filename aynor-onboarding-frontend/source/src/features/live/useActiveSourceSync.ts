import { useEffect } from "react";
import { serverRequest } from "../../lib/runtime";
// Active-workspace refresh only, never an unsupported promise of server cron.
// Existing server leases, permissions and automatic cooldown remain authoritative.
export function useActiveSourceSync(companyId: string, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let stopped = false,
      running = false;
    async function tick() {
      if (
        stopped ||
        running ||
        document.visibilityState !== "visible" ||
        !navigator.onLine
      )
        return;
      running = true;
      try {
        const catalog = await serverRequest<{
          sources: {
            id: string;
            mode: string;
            lastChecked?: number;
            lastSuccess?: number;
            tabs: { mapped: boolean; lastSuccess?: number }[];
          }[];
        }>(`/companies/${companyId}/sources`);
        if (stopped) return;
        const due = catalog.sources
          .filter(
            (s) =>
              s.mode !== "upload" &&
              s.tabs.some((t) => t.mapped) &&
              Date.now() -
                Math.max(
                  s.lastChecked || 0,
                  s.lastSuccess || 0,
                  ...s.tabs.map((t) => t.lastSuccess || 0),
                ) >=
                60000,
          )
          .sort((a, b) => (a.lastChecked || 0) - (b.lastChecked || 0))[0];
        if (due) {
          await serverRequest(
            `/companies/${companyId}/sources/${due.id}/sync`,
            "POST",
            { automatic: true },
          );
          if (!stopped)
            window.dispatchEvent(
              new CustomEvent("aynor:source-synced", { detail: { companyId } }),
            );
        }
      } catch {
        /* Existing saved data stays visible; the next heartbeat retries. */
      } finally {
        running = false;
      }
    }
    const timer = window.setInterval(() => void tick(), 60000);
    const visible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", visible);
    void tick();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [companyId, enabled]);
}
