-- 012_stage_timestamps_and_notes.sql
--
-- The detail-page redesign wants an honest per-stage timeline (Received ->
-- Extracted -> Validated -> Approved -> Synced). We already had timestamps
-- for Received (created_at), Approved-by-human (reviewed_at) and Synced
-- (qb_synced_at), but nothing for when extraction or categorization
-- actually completed — those moments existed only as "some time before the
-- next poll picked the row up." Adding the two missing columns here so the
-- extraction/categorization workflows can stamp them for real, rather than
-- the UI guessing or fabricating a time.
--
-- Also adding `notes`: a plain reviewer-facing free-text field. Nothing
-- upstream writes to it; it exists purely for the dashboard's own "Notes"
-- box on the detail page.

alter table public.invoices
  add column extracted_at timestamptz,
  add column validated_at timestamptz,
  add column notes text;

comment on column public.invoices.extracted_at is
  'Set by the extraction workflow (extraction.json, Update Invoice node) when OCR+LLM extraction completes.';
comment on column public.invoices.validated_at is
  'Set by the categorization workflow (categorization.json, Update Invoice node) when categorization + anomaly check completes and status is decided.';
comment on column public.invoices.notes is
  'Free-text reviewer note, written only from the dashboard. Not touched by any n8n workflow.';
