-- AYNOR: Supabase foundation for the Vercel migration.
-- Run the complete script in Supabase SQL Editor as the project administrator.
-- No API keys, passwords, sample users or sample data belong in this script.
-- Existing SQLite data is NOT transferred by this schema setup.
BEGIN;

CREATE TABLE IF NOT EXISTS public.aynor_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  password text NOT NULL, -- salted password hash only; never a plaintext password
  verified boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.aynor_sessions (
  token text PRIMARY KEY, -- SHA-256 hash of the session token
  user_id uuid NOT NULL REFERENCES public.aynor_users(id) ON DELETE CASCADE,
  expires bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS public.aynor_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile jsonb NOT NULL CHECK (jsonb_typeof(profile) = 'object'),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  archived boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.aynor_members (
  company_id uuid NOT NULL REFERENCES public.aynor_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.aynor_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('Owner','Admin','Executive','Department Manager','Viewer')),
  scope jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scope) = 'array'),
  PRIMARY KEY(company_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.aynor_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.aynor_companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('Admin','Executive','Department Manager','Viewer')),
  scope jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(scope) = 'array'),
  token text UNIQUE NOT NULL, -- token hash
  expires bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','accepted','declined','revoked')),
  inviter uuid NOT NULL REFERENCES public.aynor_users(id)
);
CREATE TABLE IF NOT EXISTS public.aynor_challenges (
  token text PRIMARY KEY, -- verification/reset token hash
  user_id uuid NOT NULL REFERENCES public.aynor_users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('verify','reset')),
  expires bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS public.aynor_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.aynor_companies(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.aynor_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  created bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS public.aynor_mutations (
  user_id uuid NOT NULL REFERENCES public.aynor_users(id) ON DELETE CASCADE,
  key text NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY(user_id,key)
);
CREATE TABLE IF NOT EXISTS public.aynor_sheet_oauth (
  state text PRIMARY KEY, -- one-use OAuth state hash
  user_id uuid NOT NULL REFERENCES public.aynor_users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.aynor_companies(id) ON DELETE CASCADE,
  expires bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS public.aynor_sheet_connections (
  company_id uuid PRIMARY KEY REFERENCES public.aynor_companies(id) ON DELETE CASCADE,
  credentials text NOT NULL DEFAULT '', -- encrypted OAuth tokens, empty for published CSV
  spreadsheet text,
  tab_id bigint,
  tab_title text,
  mapping jsonb CHECK (mapping IS NULL OR jsonb_typeof(mapping) = 'object'),
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','ready','syncing','synced','error','reauth_required')),
  error text,
  last_attempt bigint,
  last_success bigint,
  next_sync bigint NOT NULL DEFAULT 0,
  failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  public_url text,
  generation uuid NOT NULL DEFAULT gen_random_uuid()
);
CREATE TABLE IF NOT EXISTS public.aynor_sheet_snapshots (
  company_id uuid PRIMARY KEY REFERENCES public.aynor_companies(id) ON DELETE CASCADE,
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  created bigint NOT NULL,
  revision bigint NOT NULL CHECK (revision >= 0)
);
CREATE TABLE IF NOT EXISTS public.aynor_schema_versions (
  version text PRIMARY KEY,
  installed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aynor_sessions_user_idx ON public.aynor_sessions(user_id);
CREATE INDEX IF NOT EXISTS aynor_sessions_expiry_idx ON public.aynor_sessions(expires);
CREATE INDEX IF NOT EXISTS aynor_members_user_idx ON public.aynor_members(user_id);
CREATE INDEX IF NOT EXISTS aynor_invites_company_idx ON public.aynor_invites(company_id);
CREATE INDEX IF NOT EXISTS aynor_invites_email_idx ON public.aynor_invites(email);
CREATE INDEX IF NOT EXISTS aynor_challenges_user_idx ON public.aynor_challenges(user_id);
CREATE INDEX IF NOT EXISTS aynor_challenges_expiry_idx ON public.aynor_challenges(expires);
CREATE INDEX IF NOT EXISTS aynor_audit_company_idx ON public.aynor_audit(company_id,created);
CREATE INDEX IF NOT EXISTS aynor_oauth_expiry_idx ON public.aynor_sheet_oauth(expires);

-- Backend-only storage: no browser/anonymous access, even when the Data API is enabled.
-- The service_role is used only by the server with SUPABASE_SECRET_KEY.
-- Server-side company membership checks remain required: that role bypasses RLS.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'aynor_users','aynor_sessions','aynor_companies','aynor_members',
    'aynor_invites','aynor_challenges','aynor_audit','aynor_mutations',
    'aynor_sheet_oauth','aynor_sheet_connections','aynor_sheet_snapshots',
    'aynor_schema_versions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated',table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role',table_name);
  END LOOP;
END $$;

INSERT INTO public.aynor_schema_versions(version)
VALUES('202610270001_aynor_foundation') ON CONFLICT(version) DO NOTHING;
COMMIT;
SELECT 'AYNOR database setup complete' AS result;
