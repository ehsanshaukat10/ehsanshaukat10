// Optional schema verification with an isolated PostgreSQL-compatible test engine.
// Set PGLITE_MODULE to the installed @electric-sql/pglite module URL/path.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const modulePath = process.env.PGLITE_MODULE;
if (!modulePath)
  throw Error(
    "Set PGLITE_MODULE to an isolated @electric-sql/pglite installation; no production dependency is required.",
  );
const { PGlite } = await import(
  modulePath.startsWith("/") ? pathToFileURL(modulePath).href : modulePath
);
const db = new PGlite();
try {
  await db.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;",
  );
  const sql = readFileSync(
    new URL("./migrations/202610270001_aynor_foundation.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql);
  const tables = await db.query(
    "SELECT relname,relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r' AND relname LIKE 'aynor_%'",
  );
  assert.equal(tables.rows.length, 12);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  for (const role of ["anon", "authenticated"]) {
    await db.exec("SET ROLE " + role);
    for (const table of tables.rows)
      await assert.rejects(
        () => db.query("SELECT * FROM public." + table.relname),
        (error) => error.code === "42501",
      );
    await assert.rejects(
      () =>
        db.query(
          "INSERT INTO public.aynor_users(email,name,password) VALUES('blocked@example.test','Blocked','not-a-real-hash')",
        ),
      (error) => error.code === "42501",
    );
    await db.exec("RESET ROLE");
  }
  await db.exec("SET ROLE service_role");
  const user = await db.query(
    "INSERT INTO public.aynor_users(email,name,password,verified) VALUES('schema-test@example.test','Schema test','test-hash-only',true) RETURNING id",
  );
  assert.ok(user.rows[0].id);
  const company = await db.query(
    "INSERT INTO public.aynor_companies(profile,data) VALUES('{}','{}') RETURNING id",
  );
  await db.query(
    "INSERT INTO public.aynor_members(company_id,user_id,role) VALUES($1,$2,'Executive')",
    [company.rows[0].id, user.rows[0].id],
  );
  await db.exec("RESET ROLE");
  await db.exec(sql);
  assert.equal(
    (await db.query("SELECT count(*)::int AS n FROM public.aynor_users"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS n FROM public.aynor_schema_versions",
      )
    ).rows[0].n,
    1,
  );
  console.log(
    "PASS PostgreSQL schema: repeatable setup, twelve RLS-enabled tables, anonymous/authenticated read-write denial, server-role CRUD, role compatibility, and preservation of existing rows.",
  );
} finally {
  await db.close();
}
