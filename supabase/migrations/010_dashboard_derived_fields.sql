-- 010_dashboard_derived_fields.sql
--
-- The dashboard UI needs a pipeline-stage label, a review-reason category,
-- and a QuickBooks sync status per invoice. These must reflect only data
-- that actually exists (status, flags, export timestamps) — no invented
-- states. Computed here as PostgREST "computed columns" (functions that
-- take the row type) so the derivation lives in Postgres, not in client JS,
-- and stays correct if the status/flag model changes.
--
-- Honest stage set (no fabricated transient states like "Sending" — this
-- system polls in batches, it doesn't hold a live in-flight state):
--   received   -> pending, ingested only
--   extracted  -> processing, OCR+LLM extraction done, awaiting categorization
--   needs_review -> flagged, waiting on a human
--   approved   -> auto_approved/reviewed, not yet synced to QuickBooks
--   synced     -> auto_approved/reviewed, qb_synced_at set
--   failed     -> error

create or replace function public.invoice_pipeline_stage(inv public.invoices)
returns text
language sql
stable
as $$
  select case
    when inv.status = 'error' then 'failed'
    when inv.status = 'flagged' then 'needs_review'
    when inv.status in ('auto_approved', 'reviewed') and inv.qb_synced_at is not null then 'synced'
    when inv.status in ('auto_approved', 'reviewed') then 'approved'
    when inv.status = 'processing' then 'extracted'
    when inv.status = 'pending' then 'received'
    else 'unknown'
  end;
$$;

comment on function public.invoice_pipeline_stage(public.invoices) is
  'Dashboard display stage derived from status + export timestamps. No state beyond what is actually persisted.';

-- Review reason groups the *real* flags this system can currently raise
-- (003/005_structural_rules.sql, categorization anomaly check) into the
-- buckets the Review Queue UI shows. There is deliberately no "duplicate"
-- or "vendor_issue" bucket: true duplicates are hard-rejected pre-insert by
-- the unique index (009_email_ingestion.sql) and never become a row here,
-- and there is no vendor-name-variation flag yet (that gap is still open,
-- see docs/CURRENT_STATE.md 2026-09-16 session).
create or replace function public.invoice_review_reason(inv public.invoices)
returns text
language sql
stable
as $$
  select case
    when inv.status <> 'flagged' then null
    when inv.flags ? 'missing_invoice_number' then 'missing_invoice_number'
    when inv.flags ? 'total_mismatch' or inv.flags ? 'invalid_line_item_amount' or inv.flags ? 'anomalous_amount' then 'amount_anomaly'
    else 'other'
  end;
$$;

comment on function public.invoice_review_reason(public.invoices) is
  'Buckets a flagged invoice''s real flags array into a Review Queue category.';

create or replace function public.invoice_quickbooks_status(inv public.invoices)
returns text
language sql
stable
as $$
  select case
    when inv.qb_synced_at is not null then 'synced'
    when inv.status = 'error' then 'failed'
    else 'not_sent'
  end;
$$;

comment on function public.invoice_quickbooks_status(public.invoices) is
  'QuickBooks column status for the dashboard: synced / not_sent / failed, derived from qb_synced_at and status.';

grant execute on function
  public.invoice_pipeline_stage(public.invoices),
  public.invoice_review_reason(public.invoices),
  public.invoice_quickbooks_status(public.invoices)
  to authenticated, service_role;
