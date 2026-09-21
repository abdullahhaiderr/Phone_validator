-- ═══════════════════════════════════════════════════════════════════════════
-- US Phone Number Validator — initial schema
-- Run this in Supabase → SQL Editor (or via `supabase db push`)
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";  -- provides gen_random_uuid()

-- ─────────────────────────────────────────────────────────────
-- 1. uploads: one row per uploaded file
-- ─────────────────────────────────────────────────────────────
create table if not exists public.uploads (
    id              uuid primary key default gen_random_uuid(),
    filename        text not null,
    total_rows      integer not null default 0,
    processed_rows  integer not null default 0,
    valid_count     integer not null default 0,
    invalid_count   integer not null default 0,
    duplicate_count integer not null default 0,
    cellular_count  integer not null default 0,
    landline_count  integer not null default 0,
    voip_count      integer not null default 0,
    unknown_count   integer not null default 0,
    status          text not null default 'processing'
                    check (status in ('processing', 'completed', 'failed')),
    created_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 2. phone_results: one row per processed number
-- ─────────────────────────────────────────────────────────────
create table if not exists public.phone_results (
    id              bigint generated always as identity primary key,
    upload_id       uuid not null references public.uploads(id) on delete cascade,
    original_number text not null,          -- exactly what was in the file
    cleaned_number  text not null,          -- digits only, no leading 1
    is_valid        boolean not null default false,
    is_duplicate    boolean not null default false,  -- set by finalize_upload()
    line_type       text check (line_type in ('cellular', 'landline', 'voip', 'unknown')),
    state           text,
    city            text,
    created_at      timestamptz not null default now()
);

-- Indexes for performance at 200k+ row scale
create index if not exists phone_results_upload_id_idx     on public.phone_results (upload_id);
create index if not exists phone_results_cleaned_idx       on public.phone_results (cleaned_number);
create index if not exists phone_results_upload_valid_idx  on public.phone_results (upload_id, is_valid);
create index if not exists phone_results_upload_type_idx   on public.phone_results (upload_id, line_type);

-- ─────────────────────────────────────────────────────────────
-- 3. area_code_state: NPA (area code) → state / city
--    Free data source: https://github.com/ravisorg/Area-Code-Geolocation-Database
-- ─────────────────────────────────────────────────────────────
create table if not exists public.area_code_state (
    area_code  text not null,
    state      text not null,   -- 2-letter state/province code (e.g. "CA", "TX")
    city       text not null,
    country    text not null default 'US',
    created_at timestamptz not null default now(),
    primary key (area_code, city, state)   -- one area code covers many cities
);

create index if not exists area_code_state_code_idx on public.area_code_state (area_code);

-- ─────────────────────────────────────────────────────────────
-- 4. npa_nxx_line_type: NPA+NXX block (first 6 digits) → line type category
--    Free data source: tel-carrier-db (https://git.daplie.com/coolaj86/tel-carrier-db)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.npa_nxx_line_type (
    npa_nxx      text primary key,   -- 6 digits, e.g. "415555"
    line_type    text not null check (line_type in ('cellular', 'landline', 'voip', 'unknown')),
    source       text,               -- e.g. "tel-carrier-db", "nanpa"
    last_updated timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- 5. Helper: bump the processed-rows counter as batches land
-- ─────────────────────────────────────────────────────────────
create or replace function public.increment_processed(p_upload_id uuid, p_count integer)
returns void
language plpgsql
as $$
begin
    update public.uploads
       set processed_rows = processed_rows + p_count
     where id = p_upload_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6. Helper: run once after the last batch.
--    Marks duplicates (every valid row sharing a cleaned_number after the
--    first occurrence) and computes all dashboard counts in one transaction.
-- ─────────────────────────────────────────────────────────────
create or replace function public.finalize_upload(p_upload_id uuid)
returns void
language plpgsql
as $$
begin
    -- reset, then flag every valid row that has an earlier twin in this file
    update public.phone_results set is_duplicate = false where upload_id = p_upload_id;

    update public.phone_results pr
       set is_duplicate = true
     where pr.upload_id = p_upload_id
       and pr.is_valid
       and exists (
           select 1
             from public.phone_results x
            where x.upload_id     = p_upload_id
              and x.cleaned_number = pr.cleaned_number
              and x.is_valid
              and x.id < pr.id          -- keep only the FIRST occurrence
       );

    -- line-type counts intentionally only include valid numbers
    update public.uploads u
       set valid_count     = (select count(*) from public.phone_results where upload_id = p_upload_id and is_valid),
           invalid_count   = (select count(*) from public.phone_results where upload_id = p_upload_id and not is_valid),
           duplicate_count = (select count(*) from public.phone_results where upload_id = p_upload_id and is_duplicate),
           cellular_count  = (select count(*) from public.phone_results where upload_id = p_upload_id and is_valid and line_type = 'cellular'),
           landline_count  = (select count(*) from public.phone_results where upload_id = p_upload_id and is_valid and line_type = 'landline'),
           voip_count      = (select count(*) from public.phone_results where upload_id = p_upload_id and is_valid and line_type = 'voip'),
           unknown_count   = (select count(*) from public.phone_results where upload_id = p_upload_id and is_valid and line_type = 'unknown'),
           status          = 'completed'
     where u.id = p_upload_id;
end;
$$;
