-- 005_pending_skips_structural_rules.sql
-- Structural validation rules must not fire while a row is still `pending`
-- (freshly ingested, no extracted fields yet). Otherwise EVERY ingested
-- invoice is immediately flagged `missing_invoice_number`, and `pending`
-- becomes a state no row ever occupies.
--
-- The rules fire on the extraction UPDATE, when status moves pending -> processing
-- and the extracted fields land in the same statement (build-plan Step 5).
--
-- Run AFTER 003. Re-runnable. Only replaces the two trigger functions.

create or replace function public.check_missing_invoice_number()
returns trigger as $$
begin
  if coalesce(new.status, '') = 'pending' then
    return new;
  end if;

  if new.invoice_number is null or trim(new.invoice_number) = '' then
    new.status := 'flagged';
    new.flags := public.jsonb_add_flag(new.flags, 'missing_invoice_number');
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.check_total_vs_line_items()
returns trigger as $$
declare
  computed_subtotal numeric;
  expected_total    numeric;
  tolerance         numeric;
begin
  if coalesce(new.status, '') = 'pending' then
    return new;
  end if;

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
