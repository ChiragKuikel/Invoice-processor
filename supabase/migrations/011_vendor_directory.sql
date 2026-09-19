-- 011_vendor_directory.sql
--
-- Vendors page needs a vendor list with real stats and duplicate-name
-- detection. There is no vendor identity table — invoices.vendor_name is
-- free text from LLM extraction, so "ACME Cloud Services" and "ACME CLOUD
-- SERVICES" are two distinct string values today (this exact pair caused a
-- real "Duplicate Name Exists" QuickBooks error, worked around in
-- export-sync.json's "Match Vendor (case-insensitive)" node).
--
-- normalize_vendor_name() mirrors that node's matching rule exactly
-- (`.trim().toLowerCase()`) so the dashboard flags the same names the
-- QuickBooks sync already treats as one vendor — not a new, separate
-- notion of "same vendor".
--
-- This view is read-only grouping, not a new source of truth: it does not
-- rename anything in `invoices`. Merging variants (rewriting vendor_name
-- across rows) is a real, hard-to-reverse bulk edit and is deliberately not
-- part of this view or the page built on it.

create or replace function public.normalize_vendor_name(name text)
returns text
language sql
immutable
as $$
  select lower(trim(name));
$$;

create view public.vendor_directory
with (security_invoker = true) as
select
  public.normalize_vendor_name(i.vendor_name)                as vendor_key,
  -- Canonical display name: alphabetically-first spelling, so the choice is
  -- deterministic and stable across runs rather than arbitrary row order.
  (array_agg(i.vendor_name order by i.vendor_name))[1]        as display_name,
  array_agg(distinct i.vendor_name order by i.vendor_name)    as name_variants,
  count(distinct i.vendor_name) > 1                           as has_name_variants,
  count(*)::integer                                           as invoice_count,
  sum(i.total)                                                as total_amount,
  max(i.invoice_date)                                         as last_invoice_date,
  max(i.created_at)                                           as last_seen_at
from public.invoices i
where i.vendor_name is not null and trim(i.vendor_name) <> ''
group by public.normalize_vendor_name(i.vendor_name);

comment on view public.vendor_directory is
  'One row per vendor (case/whitespace-insensitive), aggregated straight from invoices. '
  'has_name_variants flags the same duplicate-spelling problem export-sync already works around. Read-only: no merge action.';

grant execute on function public.normalize_vendor_name(text) to service_role, authenticated;
grant select on public.vendor_directory to service_role, authenticated;
