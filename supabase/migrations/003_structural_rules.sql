-- 003_structural_rules.sql
-- Unbypassable validation rules enforced at the data layer.
-- Run AFTER 001_tables.sql and 002_rls.sql.
-- See ADR 0001 for why these live in Postgres, not n8n.

-- ============================================================
-- HELPER: pure function to add a flag to a jsonb flags array
-- ============================================================
create or replace function public.jsonb_add_flag(p_flags jsonb, p_flag text)
returns jsonb as $$
begin
  return case
    when coalesce(p_flags, '[]'::jsonb) ? p_flag then coalesce(p_flags, '[]'::jsonb)
    else coalesce(p_flags, '[]'::jsonb) || to_jsonb(p_flag)
  end;
end;
$$ language plpgsql immutable;

-- ============================================================
-- HELPER: add flag to invoices.flags jsonb if not already present.
-- For use by callers OUTSIDE a trigger on invoices itself (e.g. n8n via
-- RPC, flagging an already-committed row). Do NOT call this from a
-- BEFORE INSERT/UPDATE trigger on invoices — the row being processed
-- isn't visible to this UPDATE yet (INSERT case: no-op: 0 rows match)
-- or it self-updates the row mid-trigger (UPDATE case: recursive
-- trigger re-entry). Triggers must set new.flags directly instead,
-- via jsonb_add_flag() above.
-- ============================================================
create or replace function public.add_flag(
  p_invoice_id uuid,
  p_flag text
)
returns void as $$
begin
  update public.invoices
  set flags = public.jsonb_add_flag(flags, p_flag)
  where id = p_invoice_id;
end;
$$ language plpgsql;

-- ============================================================
-- TRIGGER 1: Total vs line-items + tax check
-- Fires on INSERT and UPDATE of subtotal, tax, total, or line_items.
-- Tolerance: 1% of total (to handle rounding).
-- ============================================================
create or replace function public.check_total_vs_line_items()
returns trigger as $$
declare
  computed_subtotal numeric;
  expected_total    numeric;
  tolerance         numeric;
begin
  -- Skip if key fields are still NULL (allow partial inserts during ingestion)
  if new.total is null or new.line_items is null then
    return new;
  end if;

  -- Sum line item amounts. Malformed OCR data (non-numeric 'amount') must
  -- not abort the whole insert/update — fail closed by flagging instead.
  begin
    select coalesce(sum((item->>'amount')::numeric), 0)
    into computed_subtotal
    from jsonb_array_elements(new.line_items) as item;
  exception when others then
    new.status := 'flagged';
    new.flags := public.jsonb_add_flag(new.flags, 'invalid_line_item_amount');
    return new;
  end;

  -- If subtotal is set, use it; otherwise use computed
  if new.subtotal is not null then
    computed_subtotal := new.subtotal;
  end if;

  expected_total := computed_subtotal + coalesce(new.tax, 0);
  tolerance := abs(new.total) * 0.01;  -- 1% of total

  if abs(new.total - expected_total) > greatest(tolerance, 0.01) then
    new.status := 'flagged';
    new.flags := public.jsonb_add_flag(new.flags, 'total_mismatch');
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_check_total
  before insert or update on public.invoices
  for each row
  when (new.total is not null and new.line_items is not null)
  execute function public.check_total_vs_line_items();

-- ============================================================
-- TRIGGER 2: Missing invoice number check
-- ============================================================
create or replace function public.check_missing_invoice_number()
returns trigger as $$
begin
  if new.invoice_number is null or trim(new.invoice_number) = '' then
    new.status := 'flagged';
    new.flags := public.jsonb_add_flag(new.flags, 'missing_invoice_number');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_check_invoice_number
  before insert or update on public.invoices
  for each row
  execute function public.check_missing_invoice_number();

-- ============================================================
-- TRIGGER 3: Audit log on every status change
-- ============================================================
create or replace function public.log_status_change()
returns trigger as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_log (invoice_id, actor, action, from_status, to_status)
    values (new.id, 'system', 'status_change', old.status, new.status);
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_audit_status_change
  after update on public.invoices
  for each row
  execute function public.log_status_change();

-- Also log initial inserts
create or replace function public.log_initial_insert()
returns trigger as $$
begin
  insert into public.audit_log (invoice_id, actor, action, to_status)
  values (new.id, 'system', 'created', new.status);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_audit_insert
  after insert on public.invoices
  for each row
  execute function public.log_initial_insert();

-- ============================================================
-- FUNCTION: is_known_vendor(vendor_name)
-- Callable from n8n via Postgres function call.
-- Returns true if vendor has processed invoices before.
-- ============================================================
create or replace function public.is_known_vendor(p_vendor_name text)
returns boolean as $$
begin
  return exists (
    select 1 from public.invoices
    where vendor_name = p_vendor_name
    limit 1
  );
end;
$$ language plpgsql;

-- ============================================================
-- FUNCTION: get_vendor_stats(p_vendor_name)
-- Returns average monthly amount and expense count for a vendor.
-- Callable from n8n for anomaly detection.
-- ============================================================
create or replace function public.get_vendor_stats(p_vendor_name text)
returns table (
  avg_monthly_amount numeric,
  total_expenses    bigint,
  months_active      bigint
) as $$
begin
  return query
  select
    coalesce(avg(i.total), 0)::numeric as avg_monthly_amount,
    count(*)::bigint as total_expenses,
    count(distinct date_trunc('month', i.invoice_date))::bigint as months_active
  from public.invoices i
  where i.vendor_name = p_vendor_name
    and i.status in ('auto_approved', 'reviewed')
    and i.invoice_date >= (current_date - interval '6 months');
end;
$$ language plpgsql;

-- ============================================================
-- TRIGGER 4: Enforce reviewer column restriction
-- RLS row-level policies (002_rls.sql) can't restrict which columns a
-- role changes, only which rows. reviewer_update_flagged_invoices only
-- intends to let reviewers change status/reviewed_by/reviewed_at — this
-- trigger makes that unbypassable at the data layer.
-- ============================================================
create or replace function public.enforce_reviewer_update_columns()
returns trigger as $$
declare
  is_reviewer boolean;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'reviewer'
  ) into is_reviewer;

  if is_reviewer and (
    new.source_file_url       is distinct from old.source_file_url or
    new.raw_ocr_text          is distinct from old.raw_ocr_text or
    new.vendor_name           is distinct from old.vendor_name or
    new.invoice_number        is distinct from old.invoice_number or
    new.invoice_date          is distinct from old.invoice_date or
    new.currency              is distinct from old.currency or
    new.subtotal              is distinct from old.subtotal or
    new.tax                   is distinct from old.tax or
    new.total                 is distinct from old.total or
    new.line_items            is distinct from old.line_items or
    new.category              is distinct from old.category or
    new.category_confidence   is distinct from old.category_confidence or
    new.is_recurring          is distinct from old.is_recurring or
    new.extraction_confidence is distinct from old.extraction_confidence or
    new.flags                 is distinct from old.flags or
    new.anomaly_note          is distinct from old.anomaly_note or
    new.idempotency_key       is distinct from old.idempotency_key or
    new.created_at            is distinct from old.created_at
  ) then
    raise exception 'reviewers may only update status, reviewed_by, reviewed_at';
  end if;

  return new;
end;
$$ language plpgsql security invoker;

create trigger trg_enforce_reviewer_columns
  before update on public.invoices
  for each row
  execute function public.enforce_reviewer_update_columns();
