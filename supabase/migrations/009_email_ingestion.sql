-- 009_email_ingestion.sql
-- Source tracking for email-triggered ingestion (build plan Step 4).
--
-- Why a composite unique index rather than a unique column:
--   * One email can carry several invoices, so the message id alone is not
--     unique per invoice — the pair (message, attachment) is.
--   * The index is PARTIAL (`where source_message_id is not null`) so rows
--     ingested via the webhook path, which have no message id, don't all
--     collide on NULL semantics or block each other.
--
-- This is the same fail-closed reasoning as `idempotency_key` (001) and ADR
-- 0001: the DB owns the guarantee. The ingestion workflow also pre-checks for
-- an already-seen attachment, but that is only an optimisation to avoid
-- burning an OCR + LLM call on a re-forwarded email — if the pre-check fails
-- or races, this index is what actually prevents the duplicate row.
--
-- `source_email_from` is kept because the sender address is often a more
-- reliable vendor signal than an OCR'd vendor name on a poor scan — useful
-- later as a cross-check against what the LLM extracts.
--
-- No grants migration needed: 006_grants.sql grants service_role on "all
-- tables in schema public", a table-level grant that covers new columns.

alter table public.invoices
  add column source_message_id      text,
  add column source_attachment_name text,
  add column source_email_from      text,
  add column source_email_subject   text;

create unique index invoices_source_email_attachment_key
  on public.invoices (source_message_id, source_attachment_name)
  where source_message_id is not null;

comment on column public.invoices.source_message_id is
  'Provider message id of the email this invoice arrived in; NULL for webhook uploads.';
comment on column public.invoices.source_attachment_name is
  'Attachment filename within that email. Unique per (message, attachment).';
