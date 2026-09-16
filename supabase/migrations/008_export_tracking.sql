-- 008_export_tracking.sql
-- Tracking columns for the "Invoice Export" workflow (Sheets + QuickBooks
-- sync). Two independent timestamps, not one combined flag, so a partial
-- failure (e.g. Sheets append succeeds, QuickBooks call fails) doesn't
-- reappend a duplicate row to the Sheet on the next poll — each side is
-- idempotent on its own column.
--
-- No grants migration needed: 006_grants.sql already grants service_role
-- select/insert/update/delete on "all tables in schema public", which is a
-- table-level grant and covers new columns automatically.

alter table public.invoices
  add column sheet_exported_at timestamptz,
  add column qb_synced_at      timestamptz,
  add column qb_bill_id        text;
