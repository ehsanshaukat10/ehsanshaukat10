-- Trusted-server read only. Does not grant browser roles access to raw source records.
-- Authorization projection happens in the shared intelligence service, not in clients.
BEGIN;
CREATE OR REPLACE FUNCTION public.aynor_intelligence_read(p_actor uuid,p_company uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object(
   'membership',jsonb_build_object('user_id',m.user_id,'role',m.role,'scope',m.scope),
   'company',to_jsonb(c),
   'connection',CASE WHEN sc.company_id IS NULL THEN NULL ELSE to_jsonb(sc)-'credentials' END,
   'snapshot',to_jsonb(s)
 )
 FROM public.aynor_companies c
 JOIN public.aynor_members m ON m.company_id=c.id AND m.user_id=p_actor
 LEFT JOIN public.aynor_sheet_connections sc ON sc.company_id=c.id
 LEFT JOIN public.aynor_sheet_snapshots s ON s.company_id=c.id
 WHERE c.id=p_company AND NOT c.archived;
$$;
REVOKE ALL ON FUNCTION public.aynor_intelligence_read(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aynor_intelligence_read(uuid,uuid) TO service_role;
COMMIT;
