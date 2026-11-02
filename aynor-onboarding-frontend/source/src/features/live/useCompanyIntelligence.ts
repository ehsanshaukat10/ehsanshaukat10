import { useEffect, useRef, useState } from "react";
import { useApp } from "../../lib/context";
import { ApiError, serverRequest } from "../../lib/runtime";
import type { Company } from "../../lib/api";
import type {
  IntelligenceAuthority,
  IntelligenceSnapshot,
} from "./semantic-types";
import {
  authorizedCachedSnapshot,
  intelligenceCacheKey,
  intelligenceQuery,
} from "./intelligence-cache";
import {
  readOverviewCache,
  writeOverviewCache,
  clearOverviewCache,
} from "./overview-cache";
// Cached facts are never painted on a fresh mount before current server authorization.
export function useCompanyIntelligence(
  company: Company,
  search: string,
  enabled = true,
  sourceRevision?: string,
) {
  const { user } = useApp();
  const query = intelligenceQuery(search),
    identity = JSON.stringify([
      user?.id,
      company.id,
      company.role,
      company.scope,
      query,
    ]);
  const [view, setView] = useState<{
    identity: string;
    report: IntelligenceSnapshot | null;
  }>({ identity: "", report: null });
  const last = useRef<{
    identity: string;
    report: IntelligenceSnapshot;
  } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled || !user) return;
    let active = true,
      sequence = 0;
    const root = `/companies/${company.id}/intelligence`;
    async function reload() {
      const current = ++sequence,
        valid = () => active && current === sequence;
      setBusy(true);
      let authorized = false;
      try {
        const proof = await serverRequest<IntelligenceAuthority>(
          root + "/context?" + query,
        );
        if (!valid()) return;
        authorized = true;
        const saved = readOverviewCache(
          intelligenceCacheKey(user!.id, company.id, proof),
        )?.report;
        const previous = last.current;
        if (
          previous?.identity === identity &&
          previous.report.authorization.fingerprint ===
            proof.authorization.fingerprint
        ) {
          setView({ identity, report: previous.report });
        } else if (authorizedCachedSnapshot(saved, company.id, proof))
          setView({ identity, report: saved });
        else {
          setView({ identity, report: null });
          clearOverviewCache();
          last.current = null;
        }
        const report = await serverRequest<IntelligenceSnapshot>(
          root + "?" + query,
        );
        if (!valid()) return;
        last.current = { identity, report };
        setView({ identity, report });
        writeOverviewCache(
          intelligenceCacheKey(user!.id, company.id, report),
          "all",
          report,
        );
        setError("");
      } catch (e) {
        if (!valid()) return;
        const denied =
          e instanceof ApiError && [401, 403, 404].includes(e.status);
        if (!authorized || denied) {
          clearOverviewCache();
          last.current = null;
          setView({ identity, report: null });
        }
        setError(
          denied
            ? "Business reporting is unavailable for your current access."
            : !authorized
              ? "Unable to verify reporting access. Retry."
              : "Unable to refresh business reporting. Retry.",
        );
      } finally {
        if (valid()) setBusy(false);
      }
    }
    void reload();
    const timer = setInterval(() => void reload(), 15000);
    const focus = () => void reload();
    window.addEventListener("focus", focus);
    const synced = (event: Event) => {
      if ((event as CustomEvent).detail?.companyId === company.id)
        void reload();
    };
    window.addEventListener("aynor:source-synced", synced);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("aynor:source-synced", synced);
    };
  }, [identity, enabled, revision, sourceRevision]);
  return {
    report: view.identity === identity ? view.report : null,
    error,
    busy,
    retry: () => setRevision((v) => v + 1),
  };
}
