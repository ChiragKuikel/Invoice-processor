-- 002_rls.sql
-- Row Level Security policies for single-company, role-based access.
-- Run AFTER 001_tables.sql.

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
alter table public.profiles    enable row level security;
alter table public.invoices    enable row level security;
alter table public.audit_log   enable row level security;
alter table public.vendor_stats enable row level security;

-- ============================================================
-- PROFILES
-- ============================================================
-- Anyone authenticated can read profiles (needed for reviewer dropdown, etc.)
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- No self-update policy: profiles currently only has id + role, and role
-- is a privilege boundary. Letting users update their own row would let
-- them self-promote 'reviewer' -> 'operator'. Role changes are an
-- admin/service-role action only (service_role bypasses RLS).

-- ============================================================
-- INVOICES
-- ============================================================
-- Operator: full access (insert, select, update, delete)
create policy "operator_full_access_invoices"
  on public.invoices for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'operator'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'operator'
    )
  );

-- Reviewer: can read all invoices
create policy "reviewer_select_invoices"
  on public.invoices for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'reviewer'
    )
  );

-- Reviewer: can update ONLY status, reviewed_by, reviewed_at on flagged invoices
create policy "reviewer_update_flagged_invoices"
  on public.invoices for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'reviewer'
    )
    and status = 'flagged'
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'reviewer'
    )
    and status in ('reviewed', 'flagged')
  );

-- ============================================================
-- AUDIT_LOG
-- ============================================================
-- Anyone authenticated can read audit log (for transparency)
create policy "audit_log_select_authenticated"
  on public.audit_log for select
  to authenticated
  using (true);

-- No insert policy for authenticated: allowing with check(true) here would let
-- any authenticated user forge arbitrary audit rows (fake actor/action/status
-- history), defeating the point of an audit log. service_role (n8n) bypasses
-- RLS for its own inserts. The trigger-driven inserts below (status/insert
-- logging performed on behalf of authenticated users) are SECURITY DEFINER,
-- so they write successfully without needing a permissive client-facing policy.

-- No updates or deletes on audit_log (append-only by convention)
-- RLS denies UPDATE/DELETE by default when no policy exists.

-- ============================================================
-- VENDOR_STATS
-- ============================================================
-- All authenticated users can read vendor_stats
create policy "vendor_stats_select_authenticated"
  on public.vendor_stats for select
  to authenticated
  using (true);

-- Operator can manage vendor_stats (n8n uses service_role which bypasses RLS anyway)
create policy "operator_manage_vendor_stats"
  on public.vendor_stats for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'operator'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'operator'
    )
  );
