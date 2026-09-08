-- ============================================================
-- 007: vendor_stats — table -> view
--
-- 001_tables.sql created vendor_stats as a base table "refreshed by a
-- scheduled n8n job". That job was never built, so the table stayed empty
-- and Check Anomaly in the categorization workflow labelled every invoice
-- "first invoice from this vendor" — noise that trains reviewers to click
-- through warnings.
--
-- The numbers are derivable from invoices (get_vendor_stats() in 003 already
-- computes them), so a view removes the refresh job entirely: no cron to
-- schedule, no staleness window, nothing that breaks when this machine is
-- off. Consistent with ADR 0001 — derived facts live in Postgres.
--
-- Column names are kept exactly as the table had them; the categorization
-- workflow selects them by name over PostgREST.
--
-- Note: avg_monthly_amount_6mo is a misnomer inherited from the table. It is
-- the mean invoice amount over the window, not mean spend per month. That is
-- what Check Anomaly actually compares a single invoice total against, so the
-- value is right for its use; only the name is off.
-- ============================================================

drop policy if exists "operator_manage_vendor_stats"      on public.vendor_stats;
drop policy if exists "vendor_stats_select_authenticated"  on public.vendor_stats;
drop table if exists public.vendor_stats;

-- security_invoker: RLS on invoices is evaluated as the querying role rather
-- than the view owner, so this cannot become a way to read invoices a role is
-- not otherwise allowed to see. service_role (n8n) bypasses RLS as before.
create view public.vendor_stats
with (security_invoker = true) as
select
  i.vendor_name,
  round(avg(i.total), 2)              as avg_monthly_amount_6mo,
  count(*)::integer                   as expense_count,
  max(i.created_at)                   as last_updated
from public.invoices i
where i.vendor_name is not null
  and i.status in ('auto_approved', 'reviewed')   -- only human-trusted rows
  and i.invoice_date >= (current_date - interval '6 months')
group by i.vendor_name;

comment on view public.vendor_stats is
  'Derived per-vendor history over the last 6 months, computed from approved '
  'invoices. Replaced the base table in 007; there is no refresh job.';

grant select on public.vendor_stats to service_role, authenticated;
