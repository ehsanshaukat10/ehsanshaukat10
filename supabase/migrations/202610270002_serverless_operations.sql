-- Run AFTER 202610270001_aynor_foundation.sql. Backend-only atomic operations.
BEGIN;
ALTER TABLE public.aynor_sheet_connections ADD COLUMN IF NOT EXISTS lease_id uuid;
ALTER TABLE public.aynor_sheet_connections ADD COLUMN IF NOT EXISTS lease_until bigint;
CREATE TABLE IF NOT EXISTS public.aynor_rate_limits (key text PRIMARY KEY, attempts integer NOT NULL, expires bigint NOT NULL);
ALTER TABLE public.aynor_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aynor_rate_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.aynor_rate_limits TO service_role;
CREATE INDEX IF NOT EXISTS aynor_rate_limits_expiry_idx ON public.aynor_rate_limits(expires);

CREATE OR REPLACE FUNCTION public.aynor_require_member(p_actor uuid,p_company uuid,p_admin boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.aynor_users WHERE id=p_actor AND verified) THEN RAISE EXCEPTION '403:Verified account required.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.aynor_companies WHERE id=p_company AND NOT archived) THEN RAISE EXCEPTION '404:Workspace unavailable.'; END IF;
 SELECT role INTO r FROM public.aynor_members WHERE company_id=p_company AND user_id=p_actor;
 IF r IS NULL THEN RAISE EXCEPTION '403:You do not have access to this workspace.'; END IF;
 IF p_admin AND r NOT IN('Owner','Admin') THEN RAISE EXCEPTION '403:An Owner or Admin is required.'; END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_rate_limit(p_key text,p_max integer,p_window bigint) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE n bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint; v integer;
BEGIN
 IF length(p_key)>128 OR p_max<1 OR p_window<1000 THEN RAISE EXCEPTION '400:Invalid rate limit.'; END IF;
 DELETE FROM public.aynor_rate_limits WHERE expires<n;
 INSERT INTO public.aynor_rate_limits(key,attempts,expires) VALUES(p_key,1,n+p_window)
 ON CONFLICT(key) DO UPDATE SET attempts=aynor_rate_limits.attempts+1 RETURNING attempts INTO v;
 RETURN v<=p_max;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_company_create(p_actor uuid,p_profile jsonb,p_data jsonb,p_key text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c uuid; previous jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.aynor_users WHERE id=p_actor AND verified) THEN RAISE EXCEPTION '403:Verified account required.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
 IF p_key IS NOT NULL THEN SELECT result INTO previous FROM public.aynor_mutations WHERE user_id=p_actor AND key=p_key; IF FOUND THEN RETURN (previous->>'companyId')::uuid; END IF; END IF;
 INSERT INTO public.aynor_companies(profile,data) VALUES(p_profile,p_data) RETURNING id INTO c;
 INSERT INTO public.aynor_members(company_id,user_id,role) VALUES(c,p_actor,'Owner');
 INSERT INTO public.aynor_audit(company_id,user_id,action,created) VALUES(c,p_actor,'company.created',floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 IF p_key IS NOT NULL THEN INSERT INTO public.aynor_mutations VALUES(p_actor,p_key,jsonb_build_object('companyId',c)); END IF;
 RETURN c;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_company_update(p_actor uuid,p_company uuid,p_version integer,p_payload jsonb,p_profile boolean DEFAULT false) RETURNS integer
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE v integer;
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company FOR UPDATE;
 PERFORM public.aynor_require_member(p_actor,p_company,true);
 SELECT version INTO v FROM public.aynor_companies WHERE id=p_company;
 IF v<>p_version THEN RAISE EXCEPTION '409:This workspace changed. Reload before saving.'; END IF;
 UPDATE public.aynor_companies SET profile=CASE WHEN p_profile THEN p_payload ELSE profile END,data=CASE WHEN p_profile THEN data ELSE p_payload END,version=version+1 WHERE id=p_company;
 INSERT INTO public.aynor_audit(company_id,user_id,action,created) VALUES(p_company,p_actor,CASE WHEN p_profile THEN 'company.profile.updated' ELSE 'configuration.updated' END,floor(extract(epoch FROM clock_timestamp())*1000)::bigint);
 RETURN v+1;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_member_change(p_actor uuid,p_company uuid,p_target uuid,p_operation text,p_role text DEFAULT NULL,p_scope jsonb DEFAULT '[]') RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE r text; target_role text; config jsonb;
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company FOR UPDATE;
 r:=public.aynor_require_member(p_actor,p_company,false);
 IF p_operation='archive' THEN
  IF r<>'Owner' THEN RAISE EXCEPTION '403:Only the Owner can archive this company.'; END IF;
  UPDATE public.aynor_companies SET archived=true WHERE id=p_company;RETURN true;
 END IF;
 IF p_operation='leave' THEN
  IF r='Owner' OR p_actor<>p_target THEN RAISE EXCEPTION '403:Owners must transfer ownership before leaving.'; END IF;
  DELETE FROM public.aynor_members WHERE company_id=p_company AND user_id=p_actor;RETURN true;
 END IF;
 IF r<>'Owner' THEN RAISE EXCEPTION '403:Only the Owner may change permissions.'; END IF;
 SELECT role INTO target_role FROM public.aynor_members WHERE company_id=p_company AND user_id=p_target;
 IF target_role IS NULL THEN RAISE EXCEPTION '404:Member not found.'; END IF;
 IF target_role='Owner' THEN RAISE EXCEPTION '403:Ownership changes require a protected transfer flow.'; END IF;
 IF p_operation='remove' THEN DELETE FROM public.aynor_members WHERE company_id=p_company AND user_id=p_target;
 ELSIF p_operation='update' THEN
  IF p_role IS NULL OR p_role NOT IN('Admin','Executive','Department Manager','Viewer') OR jsonb_typeof(p_scope)<>'array' THEN RAISE EXCEPTION '400:Invalid role or scope.'; END IF;
  SELECT data INTO config FROM public.aynor_companies WHERE id=p_company;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_scope) AS x(value) WHERE NOT (config->'departments' ? x.value)) OR (p_role IN('Viewer','Department Manager') AND jsonb_array_length(p_scope)=0) THEN RAISE EXCEPTION '400:Choose valid department access.'; END IF;
  UPDATE public.aynor_members SET role=p_role,scope=p_scope WHERE company_id=p_company AND user_id=p_target;
 ELSE RAISE EXCEPTION '400:Invalid operation.'; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_invitation_respond(p_actor uuid,p_invite uuid,p_accept boolean) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE i public.aynor_invites; u public.aynor_users;
BEGIN
 SELECT * INTO i FROM public.aynor_invites WHERE id=p_invite FOR UPDATE;
 SELECT * INTO u FROM public.aynor_users WHERE id=p_actor AND verified;
 IF i.id IS NULL OR u.id IS NULL OR i.email<>u.email THEN RAISE EXCEPTION '403:Invitation identity does not match.'; END IF;
 IF i.status<>'pending' THEN RAISE EXCEPTION '409:Invitation has already been handled.'; END IF;
 IF i.expires<floor(extract(epoch FROM clock_timestamp())*1000)::bigint THEN RAISE EXCEPTION '410:Invitation expired.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.aynor_companies WHERE id=i.company_id AND NOT archived) THEN RAISE EXCEPTION '404:Workspace unavailable.'; END IF;
 IF p_accept THEN INSERT INTO public.aynor_members VALUES(i.company_id,p_actor,i.role,i.scope) ON CONFLICT DO NOTHING; END IF;
 UPDATE public.aynor_invites SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END WHERE id=i.id;
 RETURN i.company_id;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_sheet_configure(p_actor uuid,p_company uuid,p_config jsonb,p_reset boolean) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company FOR UPDATE;
 PERFORM public.aynor_require_member(p_actor,p_company,true);
 INSERT INTO public.aynor_sheet_connections(company_id,credentials,spreadsheet,tab_id,tab_title,mapping,public_url,generation)
 VALUES(p_company,coalesce(p_config->>'credentials',''),p_config->>'spreadsheet',(p_config->>'tab_id')::bigint,p_config->>'tab_title',nullif(p_config->'mapping','null'::jsonb),p_config->>'public_url',gen_random_uuid())
 ON CONFLICT(company_id) DO UPDATE SET
 credentials=CASE WHEN p_config ? 'credentials' THEN coalesce(p_config->>'credentials','') ELSE aynor_sheet_connections.credentials END,
 spreadsheet=CASE WHEN p_config ? 'spreadsheet' THEN p_config->>'spreadsheet' ELSE aynor_sheet_connections.spreadsheet END,
 tab_id=CASE WHEN p_config ? 'tab_id' THEN (p_config->>'tab_id')::bigint ELSE aynor_sheet_connections.tab_id END,
 tab_title=CASE WHEN p_config ? 'tab_title' THEN p_config->>'tab_title' ELSE aynor_sheet_connections.tab_title END,
 mapping=CASE WHEN p_config ? 'mapping' THEN nullif(p_config->'mapping','null'::jsonb) ELSE aynor_sheet_connections.mapping END,
 public_url=CASE WHEN p_config ? 'public_url' THEN p_config->>'public_url' ELSE aynor_sheet_connections.public_url END,
 generation=gen_random_uuid(),lease_id=NULL,lease_until=NULL,revision=aynor_sheet_connections.revision+1,
 status='ready',error=NULL,last_attempt=NULL,last_success=CASE WHEN p_reset THEN NULL ELSE aynor_sheet_connections.last_success END;
 IF p_reset THEN DELETE FROM public.aynor_sheet_snapshots WHERE company_id=p_company; END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_sheet_claim(p_actor uuid,p_company uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public.aynor_sheet_connections; n bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company FOR UPDATE;
 PERFORM public.aynor_require_member(p_actor,p_company,true);
 SELECT * INTO c FROM public.aynor_sheet_connections WHERE company_id=p_company FOR UPDATE;
 IF c.mapping IS NULL THEN RAISE EXCEPTION '409:Save a field mapping first.'; END IF;
 IF c.lease_until>n THEN RAISE EXCEPTION '409:A sync is already running. Wait and refresh its status.'; END IF;
 IF c.last_attempt>n-10000 THEN RAISE EXCEPTION '429:Wait ten seconds before another sync.'; END IF;
 UPDATE public.aynor_sheet_connections SET lease_id=gen_random_uuid(),lease_until=n+120000,status='syncing',error=NULL,last_attempt=n WHERE company_id=p_company RETURNING * INTO c;
 RETURN to_jsonb(c);
END $$;
CREATE OR REPLACE FUNCTION public.aynor_sheet_publish(p_actor uuid,p_company uuid,p_generation uuid,p_lease uuid,p_data jsonb,p_error text DEFAULT NULL,p_reauth boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE c public.aynor_sheet_connections; n bigint:=floor(extract(epoch FROM clock_timestamp())*1000)::bigint;
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company FOR UPDATE;
 PERFORM public.aynor_require_member(p_actor,p_company,true);
 SELECT * INTO c FROM public.aynor_sheet_connections WHERE company_id=p_company FOR UPDATE;
 IF c.company_id IS NULL OR c.generation<>p_generation OR c.lease_id IS DISTINCT FROM p_lease OR c.lease_until<n THEN RETURN false; END IF;
 IF p_error IS NOT NULL THEN
  UPDATE public.aynor_sheet_connections SET status=CASE WHEN p_reauth THEN 'reauth_required' ELSE 'error' END,error=left(p_error,500),failures=failures+1,lease_id=NULL,lease_until=NULL WHERE company_id=p_company;
 ELSE
  IF p_data IS NULL OR jsonb_typeof(p_data)<>'object' THEN RAISE EXCEPTION '400:Invalid snapshot.'; END IF;
  INSERT INTO public.aynor_sheet_snapshots VALUES(p_company,p_data,n,c.revision+1) ON CONFLICT(company_id) DO UPDATE SET data=excluded.data,created=excluded.created,revision=excluded.revision;
  UPDATE public.aynor_sheet_connections SET status='synced',error=NULL,last_success=n,failures=0,revision=revision+1,lease_id=NULL,lease_until=NULL WHERE company_id=p_company;
 END IF;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_sheet_disconnect(p_actor uuid,p_company uuid) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company FOR UPDATE;
 PERFORM public.aynor_require_member(p_actor,p_company,true);
 DELETE FROM public.aynor_sheet_connections WHERE company_id=p_company;
 DELETE FROM public.aynor_sheet_snapshots WHERE company_id=p_company;
 DELETE FROM public.aynor_sheet_oauth WHERE company_id=p_company;
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.aynor_sheet_read(p_actor uuid,p_company uuid,p_snapshot boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE connection jsonb; snapshot jsonb;
BEGIN
 PERFORM 1 FROM public.aynor_companies WHERE id=p_company FOR UPDATE;
 PERFORM public.aynor_require_member(p_actor,p_company,true);
 SELECT to_jsonb(c)-'credentials' INTO connection FROM public.aynor_sheet_connections c WHERE company_id=p_company;
 IF p_snapshot THEN SELECT to_jsonb(s) INTO snapshot FROM public.aynor_sheet_snapshots s WHERE company_id=p_company;
 ELSE SELECT jsonb_build_object('created',s.created,'revision',s.revision) INTO snapshot FROM public.aynor_sheet_snapshots s WHERE company_id=p_company; END IF;
 RETURN jsonb_build_object('connection',connection,'snapshot',snapshot);
END $$;
-- No callable SQL entry points for browser roles. Only server-held credentials.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN('aynor_require_member','aynor_rate_limit','aynor_company_create','aynor_company_update','aynor_member_change','aynor_invitation_respond','aynor_sheet_configure','aynor_sheet_claim','aynor_sheet_publish','aynor_sheet_disconnect','aynor_sheet_read') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 END LOOP;
END $$;
INSERT INTO public.aynor_schema_versions(version) VALUES('202610270002_serverless_operations') ON CONFLICT DO NOTHING;
COMMIT;
SELECT 'AYNOR serverless setup complete' AS result;
