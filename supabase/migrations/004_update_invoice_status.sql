-- 004_update_invoice_status.sql
-- Atomic helper for n8n to transition an invoice's status with a reason.
--
-- Audit logging is owned by the trigger `log_status_change` (003), NOT by this
-- function. This function only records *who* and *why* via transaction-local
-- GUCs (`app.actor`, `app.reasoning`) that the trigger reads. This avoids the
-- previous double-write (function insert + trigger insert on the same UPDATE).
--
-- Run AFTER 001-003. Re-runnable.

-- ============================================================
-- Replace the 003 trigger function so it attributes the change
-- to the caller-supplied actor/reasoning when present.
-- ============================================================
create or replace function public.log_status_change()
returns trigger as $$
begin
  if old.status is distinct from new.status then
    insert into public.audit_log (invoice_id, actor, action, from_status, to_status, reasoning)
    values (
      new.id,
      coalesce(nullif(current_setting('app.actor', true), ''), 'system'),
      'status_change',
      old.status,
      new.status,
      nullif(current_setting('app.reasoning', true), '')
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================
-- update_invoice_status: set app.actor / app.reasoning, then UPDATE.
-- The trigger writes the single audit_log row.
-- ============================================================
create or replace function public.update_invoice_status(
  p_invoice_id uuid,
  p_new_status text,
  p_actor text,
  p_reasoning text default null
)
returns void as $$
declare
  v_exists boolean;
begin
  -- No-op if no invoice id was supplied (e.g. ingestion failed before the
  -- row was inserted). audit_log.invoice_id is NOT NULL, so there is nothing
  -- to write; the error workflow still notifies via Slack.
  if p_invoice_id is null then
    return;
  end if;

  select exists(select 1 from public.invoices where id = p_invoice_id) into v_exists;
  if not v_exists then
    return;
  end if;

  -- Transaction-local; read by log_status_change(). `true` = is_local.
  perform set_config('app.actor', coalesce(p_actor, 'system'), true);
  perform set_config('app.reasoning', coalesce(p_reasoning, ''), true);

  update public.invoices
  set status = p_new_status
  where id = p_invoice_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.update_invoice_status(uuid, text, text, text) to service_role;
