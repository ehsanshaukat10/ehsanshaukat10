BEGIN;
CREATE TABLE IF NOT EXISTS public.aynor_ask_consents (
 company_id uuid NOT NULL REFERENCES public.aynor_companies(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.aynor_users(id) ON DELETE CASCADE,
 approval text NOT NULL,granted boolean NOT NULL,version uuid NOT NULL DEFAULT gen_random_uuid(),updated bigint NOT NULL,
 PRIMARY KEY(company_id,user_id)
);
CREATE TABLE IF NOT EXISTS public.aynor_ask_requests (
 company_id uuid NOT NULL REFERENCES public.aynor_companies(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES public.aynor_users(id) ON DELETE CASCADE,
 id uuid NOT NULL,session_id text NOT NULL,body_hash text NOT NULL,proof text NOT NULL,status text NOT NULL CHECK(status IN('pending','done')),
 response text,expires bigint NOT NULL,created bigint NOT NULL,
 PRIMARY KEY(company_id,user_id,id)
);
ALTER TABLE public.aynor_ask_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aynor_ask_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aynor_ask_consents,public.aynor_ask_requests FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.aynor_ask_consents,public.aynor_ask_requests TO service_role;
CREATE OR REPLACE FUNCTION public.aynor_ask_runtime(p_actor uuid,p_company uuid,p_session text,p_operation text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE n bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; c public.aynor_ask_consents; r public.aynor_ask_requests; actual jsonb;
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company AND NOT archived FOR UPDATE;
 PERFORM public.aynor_require_member(p_actor,p_company,false);
 IF NOT EXISTS(SELECT 1 FROM public.aynor_sessions WHERE token=p_session AND user_id=p_actor AND expires>n) THEN RAISE EXCEPTION '401:Session has expired.'; END IF;
 SELECT * INTO c FROM public.aynor_ask_consents WHERE company_id=p_company AND user_id=p_actor;
 IF p_operation='consent' THEN
  INSERT INTO public.aynor_ask_consents VALUES(p_company,p_actor,p_payload->>'approval',(p_payload->>'granted')::boolean,gen_random_uuid(),n)
  ON CONFLICT(company_id,user_id) DO UPDATE SET approval=excluded.approval,granted=excluded.granted,version=excluded.version,updated=excluded.updated RETURNING * INTO c;
  DELETE FROM public.aynor_ask_requests WHERE company_id=p_company AND user_id=p_actor;
  INSERT INTO public.aynor_audit(company_id,user_id,action,created) VALUES(p_company,p_actor,CASE WHEN c.granted THEN 'ask.consent.granted' ELSE 'ask.consent.revoked' END,n);
  RETURN to_jsonb(c);
 ELSIF p_operation='status' THEN RETURN to_jsonb(c);
 ELSIF p_operation='claim' THEN
  IF (SELECT jsonb_build_object('role',role,'scope',scope) FROM public.aynor_members WHERE company_id=p_company AND user_id=p_actor) IS DISTINCT FROM p_payload->'membership' THEN RAISE EXCEPTION '409:Reporting access changed. Start a new conversation.'; END IF;
  -- The company lock serializes its user claims; a short advisory lock also protects the global concurrency ceiling.
  PERFORM pg_advisory_xact_lock(748504);
  DELETE FROM public.aynor_ask_requests WHERE expires<=n;
  SELECT * INTO r FROM public.aynor_ask_requests WHERE company_id=p_company AND user_id=p_actor AND id=(p_payload->>'id')::uuid;
  IF r.id IS NOT NULL THEN
   IF r.session_id<>p_session OR r.body_hash<>p_payload->>'bodyHash' OR r.proof<>p_payload->>'proof' THEN RAISE EXCEPTION '409:This question changed. Start a new request.'; END IF;
   RETURN jsonb_build_object('status',r.status,'response',r.response);
  END IF;
  IF EXISTS(SELECT 1 FROM public.aynor_ask_requests WHERE user_id=p_actor AND status='pending' AND expires>n) OR (SELECT count(*) FROM public.aynor_ask_requests WHERE status='pending' AND expires>n)>=2 THEN RAISE EXCEPTION '409:An answer is already being prepared. Retry shortly.'; END IF;
  IF (p_payload->>'external')::boolean AND (c.user_id IS NULL OR NOT c.granted OR c.approval<>p_payload->>'approval' OR c.version::text<>p_payload->>'consentVersion') THEN RAISE EXCEPTION '409:External AI consent changed. Review your consent.'; END IF;
  INSERT INTO public.aynor_ask_requests VALUES(p_company,p_actor,(p_payload->>'id')::uuid,p_session,p_payload->>'bodyHash',p_payload->>'proof','pending',NULL,n+45000,n);
  RETURN jsonb_build_object('status','claimed');
 ELSIF p_operation='finish' THEN
  SELECT * INTO r FROM public.aynor_ask_requests WHERE company_id=p_company AND user_id=p_actor AND id=(p_payload->>'id')::uuid FOR UPDATE;
  IF r.id IS NULL OR r.status<>'pending' OR r.expires<=n OR r.session_id<>p_session OR r.proof<>p_payload->>'proof' THEN RAISE EXCEPTION '409:Answer expired. Retry with current data.'; END IF;
  IF (p_payload->>'external')::boolean AND (c.user_id IS NULL OR NOT c.granted OR c.approval<>p_payload->>'approval' OR c.version::text<>p_payload->>'consentVersion') THEN RAISE EXCEPTION '409:External AI consent changed. Review your consent.'; END IF;
  SELECT jsonb_build_object('companyVersion',co.version,'snapshotRevision',s.revision,'snapshotCreated',s.created,'generation',sc.generation,'connectionRevision',sc.revision) INTO actual
  FROM public.aynor_companies co LEFT JOIN public.aynor_sheet_connections sc ON sc.company_id=co.id LEFT JOIN public.aynor_sheet_snapshots s ON s.company_id=co.id WHERE co.id=p_company;
  IF (SELECT jsonb_build_object('role',role,'scope',scope) FROM public.aynor_members WHERE company_id=p_company AND user_id=p_actor) IS DISTINCT FROM p_payload->'membership' OR COALESCE((SELECT jsonb_agg(jsonb_build_array(id,version) ORDER BY id) FROM public.aynor_action_records WHERE company_id=p_company),'[]'::jsonb) IS DISTINCT FROM p_payload->'actionVersions' THEN RAISE EXCEPTION '409:Reporting access or decisions changed. Retry.'; END IF;
  IF actual IS DISTINCT FROM p_payload->'fence' THEN RAISE EXCEPTION '409:Company data changed. Refresh before continuing.'; END IF;
  UPDATE public.aynor_ask_requests SET status='done',response=p_payload->>'response',expires=n+1800000 WHERE company_id=p_company AND user_id=p_actor AND id=r.id;
  RETURN jsonb_build_object('ok',true);
 ELSIF p_operation='release' THEN
  DELETE FROM public.aynor_ask_requests WHERE company_id=p_company AND user_id=p_actor AND id=(p_payload->>'id')::uuid AND session_id=p_session AND status='pending';
  RETURN jsonb_build_object('ok',true);
 END IF;
 RAISE EXCEPTION '400:Unsupported assistant operation.';
END $$;
REVOKE ALL ON FUNCTION public.aynor_ask_runtime(uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aynor_ask_runtime(uuid,uuid,text,text,jsonb) TO service_role;
COMMIT;
