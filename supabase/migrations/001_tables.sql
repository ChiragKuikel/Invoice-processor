-- 001_tables.sql
-- Core schema: profiles, invoices, audit_log, vendor_stats
-- Run in Supabase SQL Editor after project creation.

-- ============================================================
-- PROFILES — extends Supabase auth.users
-- ============================================================
create table public.profiles (
  id   uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('operator', 'reviewer'))
);

-- Auto-create profile on signup with least-privilege default role.
-- Promotion to 'operator' is an explicit admin/service-role action.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'reviewer');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- INVOICES — main table
-- ============================================================
create table public.invoices (
  id                    uuid primary key default gen_random_uuid(),

  -- source
  source_file_url       text not null,
  raw_ocr_text          text,

  -- extracted fields
  vendor_name           text,
  invoice_number        text,
  invoice_date          date,
  currency              text default 'USD',
  subtotal              numeric(12,2),
  tax                   numeric(12,2),
  total                 numeric(12,2),
  line_items            jsonb default '[]'::jsonb,

  -- classification
  category              text,
  category_confidence   numeric(3,2),
  is_recurring          boolean default false,

  -- quality signals
  extraction_confidence numeric(3,2),

  -- state machine
  status                text not null default 'pending'
                        check (status in (
                          'pending', 'processing', 'auto_approved',
                          'flagged', 'reviewed', 'error'
                        )),
  flags                 jsonb default '[]'::jsonb,
  anomaly_note          text,

  -- dedupe
  idempotency_key       text unique,

  -- review
  reviewed_by           uuid references public.profiles(id),
  reviewed_at           timestamptz,

  created_at            timestamptz not null default now()
);

-- Fast lookups
create index idx_invoices_status on public.invoices(status);
create index idx_invoices_vendor on public.invoices(vendor_name);
create index idx_invoices_created on public.invoices(created_at);

-- Composite indexes for dashboard/anomaly-detection query patterns
create index idx_invoices_status_created on public.invoices(status, created_at desc);
create index idx_invoices_vendor_status_date on public.invoices(vendor_name, status, invoice_date);

-- ============================================================
-- AUDIT_LOG — append-only, trigger-populated on status change
-- ============================================================
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  actor       text not null,                -- 'system', 'n8n', or user id
  action      text not null,                -- e.g. 'status_change', 'flag_set'
  from_status text,
  to_status   text,
  reasoning   text,
  created_at  timestamptz not null default now()
);

create index idx_audit_log_invoice on public.audit_log(invoice_id);

-- ============================================================
-- VENDOR_STATS — refreshed by scheduled n8n job
-- ============================================================
create table public.vendor_stats (
  vendor_name            text primary key,
  avg_monthly_amount_6mo numeric(12,2),
  expense_count          integer default 0,
  last_updated           timestamptz not null default now()
);

-- ============================================================
-- STORAGE BUCKET — raw invoice files
-- ============================================================
-- Run this AFTER creating the bucket in Supabase Dashboard > Storage:
--   Bucket name: invoices
--   Public: false (private, RLS-enforced)
--
-- Or use the Supabase management API / SQL:
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- Storage RLS policies (Supabase Storage uses its own schema)
-- Operator: full access to upload/read
-- Reviewer: read-only
create policy "Operator can upload invoices"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'invoices'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'operator'
    )
  );

create policy "Authenticated can read invoices"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'invoices');
