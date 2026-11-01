BEGIN;
CREATE TABLE IF NOT EXISTS public.aynor_action_records (
 company_id uuid NOT NULL REFERENCES public.aynor_companies(id) ON DELETE CASCADE,
 id text NOT NULL CHECK(length(id) BETWEEN 1 AND 180),
 kind text NOT NULL CHECK(kind IN ('decision','task')),
 data jsonb NOT NULL CHECK(jsonb_typeof(data)='object'),
 version integer NOT NULL CHECK(version>0),
 created bigint NOT NULL, updated bigint NOT NULL, actor uuid NOT NULL REFERENCES public.aynor_users(id),
 PRIMARY KEY(company_id,id)
);
ALTER TABLE public.aynor_action_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aynor_action_records FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.aynor_action_records TO service_role;
-- One coherent, trusted-server read for membership, source state and action records.
CREATE OR REPLACE FUNCTION public.aynor_intelligence_read(p_actor uuid,p_company uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('membership',jsonb_build_object('user_id',m.user_id,'role',m.role,'scope',m.scope),
 'company',to_jsonb(c),'connection',CASE WHEN sc.company_id IS NULL THEN NULL ELSE to_jsonb(sc)-'credentials' END,
 'snapshot',to_jsonb(s),'actions',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.updated DESC,a.id) FROM public.aynor_action_records a WHERE a.company_id=c.id),'[]'::jsonb))
 FROM public.aynor_companies c JOIN public.aynor_members m ON m.company_id=c.id AND m.user_id=p_actor
 LEFT JOIN public.aynor_sheet_connections sc ON sc.company_id=c.id LEFT JOIN public.aynor_sheet_snapshots s ON s.company_id=c.id
 WHERE c.id=p_company AND NOT c.archived;
$$;
CREATE OR REPLACE FUNCTION public.aynor_action_write(p_actor uuid,p_company uuid,p_id text,p_kind text,p_data jsonb,p_version integer,p_fence jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE existing public.aynor_action_records; result public.aynor_action_records; actual jsonb; n bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company FOR UPDATE;
 PERFORM public.aynor_require_member(p_actor,p_company,true);
 SELECT jsonb_build_object('companyVersion',c.version,'snapshotRevision',s.revision,'snapshotCreated',s.created,'generation',sc.generation,'connectionRevision',sc.revision) INTO actual
 FROM public.aynor_companies c LEFT JOIN public.aynor_sheet_connections sc ON sc.company_id=c.id LEFT JOIN public.aynor_sheet_snapshots s ON s.company_id=c.id WHERE c.id=p_company;
 IF actual IS DISTINCT FROM p_fence THEN RAISE EXCEPTION '409:Company data changed. Refresh before saving.'; END IF;
 IF p_kind NOT IN('task','decision') OR jsonb_typeof(p_data)<>'object' OR length(p_id)>180 THEN RAISE EXCEPTION '400:Invalid action record.'; END IF;
 SELECT * INTO existing FROM public.aynor_action_records WHERE company_id=p_company AND id=p_id FOR UPDATE;
 IF COALESCE(existing.version,0)<>p_version THEN RAISE EXCEPTION '409:This action changed. Refresh before saving.'; END IF;
 IF existing.id IS NULL AND (SELECT count(*) FROM public.aynor_action_records WHERE company_id=p_company)>=500 THEN RAISE EXCEPTION '400:The action record limit was reached.'; END IF;
 IF existing.id IS NOT NULL AND existing.kind<>p_kind THEN RAISE EXCEPTION '400:Action origin cannot change.'; END IF;
 INSERT INTO public.aynor_action_records VALUES(p_company,p_id,p_kind,p_data,p_version+1,COALESCE(existing.created,n),n,p_actor)
 ON CONFLICT(company_id,id) DO UPDATE SET data=excluded.data,version=excluded.version,updated=excluded.updated,actor=excluded.actor RETURNING * INTO result;
 INSERT INTO public.aynor_audit(company_id,user_id,action,created) VALUES(p_company,p_actor,'action.'||p_kind||'.saved',n);
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION public.aynor_intelligence_read(uuid,uuid),public.aynor_action_write(uuid,uuid,text,text,jsonb,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aynor_intelligence_read(uuid,uuid),public.aynor_action_write(uuid,uuid,text,text,jsonb,integer,jsonb) TO service_role;
COMMIT;
