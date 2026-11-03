-- Endpoint IndoBERT yang didaftarkan Mac. Hanya service_role.
-- Tidak ada kebijakan untuk anon atau authenticated, jadi Data API menolak mereka.

create table public.model_endpoint (
  id text primary key default 'current' check (id = 'current'),
  url text not null,
  token text not null,
  seen_at timestamptz not null default now()
);

alter table public.model_endpoint enable row level security;

revoke all on table public.model_endpoint from public, anon, authenticated;
grant select, insert, update on table public.model_endpoint to service_role;
