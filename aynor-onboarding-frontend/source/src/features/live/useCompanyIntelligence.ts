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
      running = false,
      queued = false,
      failed = false,
      controller: AbortController | null = null;
    const root = `/companies/${company.id}/intelligence`;
    async function request<T>(path: string) {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 12000);
      try {
        return await serverRequest<T>(
          path,
          "GET",
          undefined,
          {},
          {
            signal: controller.signal,
          },
        );
      } finally {
        window.clearTimeout(timeout);
        controller = null;
      }
    }
    async function reload(force = true) {
      if (running) {
        queued = true;
        return;
      }
      if (!force && failed) return;
      running = true;
      const hasCurrentReport =
        last.current?.identity === identity && !!last.current.report;
      setBusy(!hasCurrentReport);
      let authorized = false;
      try {
        const proof = await request<IntelligenceAuthority>(
          root + "/context?" + query,
        );
        if (!active) return;
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
        const report = await request<IntelligenceSnapshot>(root + "?" + query);
        if (!active) return;
        last.current = { identity, report };
        setView({ identity, report });
        writeOverviewCache(
          intelligenceCacheKey(user!.id, company.id, report),
          "all",
          report,
        );
        setError("");
        failed = false;
      } catch (e) {
        if (!active) return;
        const denied =
            e instanceof ApiError && [401, 403, 404].includes(e.status),
          setupIncomplete =
            e instanceof ApiError &&
            e.status === 503 &&
            e.message ===
              "Business intelligence setup is incomplete. Apply the pending AYNOR intelligence-read migration.";
        if (!authorized || denied) {
          clearOverviewCache();
          last.current = null;
          setView({ identity, report: null });
        }
        if (hasCurrentReport && authorized && !denied && !setupIncomplete)
          setError("");
        else
          setError(
            denied
              ? "Business reporting is unavailable for your current access."
              : setupIncomplete
                ? "Aynor’s reporting database update has not been installed. Your connected spreadsheet is safe. An administrator must install the reporting update, then retry."
                : e instanceof DOMException && e.name === "AbortError"
                  ? "Business reporting took too long to respond. Retry."
                  : !authorized
                    ? "Unable to verify reporting access. Retry."
                    : "Unable to refresh business reporting. Retry.",
          );
        failed = true;
      } finally {
        running = false;
        if (active) setBusy(false);
        if (active && queued) {
          queued = false;
          queueMicrotask(() => void reload(true));
        }
      }
    }
    void reload();
    const timer = setInterval(() => void reload(false), 60000);
    const focus = () => void reload();
    window.addEventListener("focus", focus);
    const synced = (event: Event) => {
      if ((event as CustomEvent).detail?.companyId === company.id)
        void reload();
    };
    window.addEventListener("aynor:source-synced", synced);
    return () => {
      active = false;
      controller?.abort();
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
