-- Review artifact for Sprint A. Apply locally for tests only until deployment approval.
-- Existing company_update and sheet_publish already lock the same company row.
-- Triggers put department integrity inside that serialization boundary.
BEGIN;
CREATE OR REPLACE FUNCTION public.aynor_workflow_company_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE removed jsonb; snapshot jsonb; d text;
BEGIN
 SELECT coalesce(jsonb_agg(x.value),'[]'::jsonb) INTO removed
 FROM jsonb_array_elements_text(coalesce(OLD.data->'departments','[]'::jsonb)) x
 WHERE NOT coalesce(NEW.data->'departments','[]'::jsonb) ? x.value;
 IF jsonb_array_length(removed)>0 THEN
  SELECT data INTO snapshot FROM public.aynor_sheet_snapshots WHERE company_id=NEW.id;
  FOR d IN SELECT jsonb_array_elements_text(removed) LOOP
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(snapshot->'sources','[]'::jsonb)) s
      WHERE s->>'department'=d OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s->'tabs','[]'::jsonb)) t
        WHERE coalesce(t->>'department',s->>'department','')=d OR t->'config'->>'department'=d))
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(snapshot->'tables','[]'::jsonb)) t WHERE t->>'department'=d)
     OR EXISTS(SELECT 1 FROM public.aynor_sheet_connections sc CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN sc.mapping->>'kind'='tables' THEN coalesce(sc.mapping->'tables','[]'::jsonb) ELSE '[]'::jsonb END) t WHERE sc.company_id=NEW.id AND t->>'department'=d) THEN
      RAISE EXCEPTION '409:Department "%" still has worksheet assignments. Reassign them in Data connections before removing it. Confirmed relationships continue to use those worksheet scopes.',d;
   END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.data->'governedGoals','[]'::jsonb)) g
      WHERE g->>'lifecycle'<>'Archived' AND (g->>'department'=d OR g->'protection'->>'department'=d)) THEN
      RAISE EXCEPTION '409:Department "%" still has active or paused goals. Review their metric scopes or archive them before removing it.',d;
   END IF;
   IF EXISTS(SELECT 1 FROM public.aynor_members m WHERE m.company_id=NEW.id AND m.scope ? d)
      OR EXISTS(SELECT 1 FROM public.aynor_invites i WHERE i.company_id=NEW.id AND i.status='pending' AND i.expires>floor(extract(epoch FROM clock_timestamp())*1000)::bigint AND i.scope ? d) THEN
      RAISE EXCEPTION '409:Department "%" still has assigned member or invitation access. Resolve it in Team & permissions before removing it.',d;
   END IF;
  END LOOP;
 END IF;
 -- Old clients cannot restore a second legacy record after a goal handoff.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.data->'goals','[]'::jsonb)) g
   JOIN jsonb_array_elements(coalesce(NEW.data->'governedGoals','[]'::jsonb)) v ON v->>'id'=g->>'id'
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(OLD.data->'goals','[]'::jsonb)) oldg
      JOIN jsonb_array_elements(coalesce(OLD.data->'governedGoals','[]'::jsonb)) oldv ON oldv->>'id'=oldg->>'id'
      WHERE oldg->>'id'=g->>'id')) THEN
    RAISE EXCEPTION '409:This goal already has a governed definition. Refresh and edit the existing goal in Goals.';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aynor_workflow_company_guard ON public.aynor_companies;
CREATE TRIGGER aynor_workflow_company_guard BEFORE UPDATE OF data ON public.aynor_companies
FOR EACH ROW EXECUTE FUNCTION public.aynor_workflow_company_guard();

CREATE OR REPLACE FUNCTION public.aynor_workflow_source_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE allowed jsonb; old_data jsonb; d text;
BEGIN
 -- Lock ordering matches sheet_publish. Existing inconsistent imports are kept,
 -- but a concurrent mapping edit cannot introduce a new orphan assignment.
 SELECT data->'departments' INTO allowed FROM public.aynor_companies WHERE id=NEW.company_id FOR UPDATE;
 old_data:=CASE WHEN TG_OP='UPDATE' THEN OLD.data ELSE '{}'::jsonb END;
 FOR d IN SELECT DISTINCT x.department FROM (
   SELECT s->>'department' AS department FROM jsonb_array_elements(coalesce(NEW.data->'sources','[]'::jsonb)) s
   UNION ALL SELECT coalesce(t->>'department',t->'config'->>'department',s->>'department','')
     FROM jsonb_array_elements(coalesce(NEW.data->'sources','[]'::jsonb)) s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s->'tabs','[]'::jsonb)) t
   UNION ALL SELECT t->>'department' FROM jsonb_array_elements(coalesce(NEW.data->'tables','[]'::jsonb)) t
 ) x WHERE x.department<>'' AND NOT coalesce(allowed,'[]'::jsonb) ? x.department LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(old_data->'sources','[]'::jsonb)) s
      WHERE s->>'department'=d OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s->'tabs','[]'::jsonb)) t WHERE coalesce(t->>'department',t->'config'->>'department',s->>'department','')=d))
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(old_data->'tables','[]'::jsonb)) t WHERE t->>'department'=d) THEN
      RAISE EXCEPTION '409:Department configuration changed. Reload Data connections and choose a configured department.';
   END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS aynor_workflow_source_guard ON public.aynor_sheet_snapshots;
CREATE TRIGGER aynor_workflow_source_guard BEFORE INSERT OR UPDATE OF data ON public.aynor_sheet_snapshots
FOR EACH ROW EXECUTE FUNCTION public.aynor_workflow_source_guard();
REVOKE ALL ON FUNCTION public.aynor_workflow_company_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.aynor_workflow_source_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aynor_workflow_company_guard(),public.aynor_workflow_source_guard() TO service_role;
INSERT INTO public.aynor_schema_versions(version) VALUES('202611030001_workflow_integrity') ON CONFLICT DO NOTHING;
COMMIT;
