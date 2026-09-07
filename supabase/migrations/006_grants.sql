-- 006_grants.sql
-- RLS (002) governs *which rows* a role sees. It does NOT grant the base
-- table privilege — without an explicit GRANT, PostgREST calls fail with
-- `42501 permission denied for table ...` regardless of policies.
--
--   * service_role  (n8n, via sb_secret_ key) — bypasses RLS, still needs GRANT.
--   * authenticated (dashboard, Step 9)        — needs GRANT; RLS then gates rows.
--   * anon                                     — no table access (login required).
--
-- Run AFTER 001-003. Re-runnable.

grant usage on schema public to anon, authenticated, service_role;

-- ============================================================
-- service_role — the trusted backend role used by n8n.
-- Full DML; RLS is bypassed for this role by design.
-- ============================================================
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- ============================================================
-- authenticated — the dashboard (reviewer / operator). Base privilege only;
-- 002_rls.sql policies decide which rows each actually touches.
-- ============================================================
grant select, insert, update, delete
  on public.invoices, public.profiles, public.audit_log, public.vendor_stats
  to authenticated;
grant execute on function
  public.is_known_vendor(text),
  public.get_vendor_stats(text)
  to authenticated;

-- ============================================================
-- Future tables/functions created by this role inherit the same grants,
-- so later migrations don't have to repeat this.
-- ============================================================
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
