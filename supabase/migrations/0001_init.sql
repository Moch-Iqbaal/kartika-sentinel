-- Kartika Sentinel. Embedding = 128, sama dengan EMBED_DIM di src/lib/embed/hashing.ts
-- (feature hashing lokal, bukan vektor tersembunyi IndoBERT 768).
-- service_role hanya dipakai server. Jangan menaruhnya di variabel NEXT_PUBLIC_.

create extension if not exists vector;
create extension if not exists pgcrypto;

create table public.analysts (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null check (role in ('analyst', 'admin')),
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  external_id text not null,
  url text,
  author_handle_hash text,
  content text not null,
  posted_at timestamptz,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (platform, external_id)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts (id) on delete set null,
  input_text text not null,
  hoax_score numeric not null check (hoax_score >= 0 and hoax_score <= 1),
  topic_tags text[] not null default '{}',
  ai_flag boolean not null default false,
  ai_score numeric check (ai_score is null or (ai_score >= 0 and ai_score <= 1)),
  model_version text not null,
  embedding vector(128),
  rationale jsonb,
  created_at timestamptz not null default now()
);

create index analyses_topic_tags_gin on public.analyses using gin (topic_tags);

create table public.fact_checks (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  claim text not null,
  verdict text not null check (verdict in ('hoax', 'misleading', 'true', 'unverified')),
  url text,
  published_at date,
  summary text,
  license text,
  embedding vector(128),
  created_at timestamptz not null default now()
);

create index fact_checks_embedding_hnsw
  on public.fact_checks
  using hnsw (embedding vector_cosine_ops);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  fact_check_id uuid not null references public.fact_checks (id) on delete cascade,
  similarity numeric not null check (similarity >= -1 and similarity <= 1),
  unique (analysis_id, fact_check_id)
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'closed')),
  assigned_to uuid references public.analysts (id),
  created_by uuid references public.analysts (id),
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses (id) on delete cascade,
  case_id uuid references public.cases (id) on delete set null,
  risk_score numeric not null check (risk_score >= 0 and risk_score <= 1),
  status text not null default 'new' check (status in ('new', 'triaged', 'escalated', 'dismissed')),
  assigned_to uuid references public.analysts (id),
  virality numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index alerts_open_risk_desc
  on public.alerts (risk_score desc)
  where status in ('new', 'triaged');

create table public.post_metrics (
  post_id uuid not null references public.posts (id) on delete cascade,
  observed_at timestamptz not null,
  likes integer not null default 0,
  shares integer not null default 0,
  comments integer not null default 0,
  primary key (post_id, observed_at)
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid,
  action text not null,
  actor uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.analysts a
    where a.id = (select auth.uid()) and a.role = 'admin'
  );
$$;

create or replace function public.is_analyst()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.analysts a
    where a.id = (select auth.uid()) and a.role in ('analyst', 'admin')
  );
$$;

create or replace function public.match_fact_checks(
  query_embedding vector(128),
  match_count integer default 5
)
returns table (
  id uuid,
  title text,
  claim text,
  verdict text,
  url text,
  source text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    f.id, f.title, f.claim, f.verdict, f.url, f.source,
    (1 - (f.embedding <=> query_embedding))::double precision as similarity
  from public.fact_checks f
  where f.embedding is not null
  order by f.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (table_name, row_id, action, actor, diff)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
  );
  return coalesce(new, old);
end;
$$;

create trigger alerts_audit
after insert or update or delete on public.alerts
for each row execute function public.audit_row_change();

create trigger cases_audit
after insert or update or delete on public.cases
for each row execute function public.audit_row_change();

create trigger analysts_audit
after insert or update or delete on public.analysts
for each row execute function public.audit_row_change();

create or replace function public.purge_old_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not public.is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'forbidden';
  end if;
  delete from public.posts p
  where p.demo = true
    and p.posted_at < now() - interval '90 days'
    and not exists (
      select 1
      from public.analyses a
      join public.alerts al on al.analysis_id = a.id
      where a.post_id = p.id
        and al.case_id is not null
    );
  get diagnostics removed = row_count;
  return removed;
end;
$$;

alter table public.analysts enable row level security;
alter table public.posts enable row level security;
alter table public.analyses enable row level security;
alter table public.fact_checks enable row level security;
alter table public.matches enable row level security;
alter table public.cases enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_log enable row level security;
alter table public.post_metrics enable row level security;

revoke all on all tables in schema public from anon;
revoke update, delete on public.audit_log from authenticated, anon;

grant select on public.analysts, public.posts, public.analyses, public.fact_checks,
  public.matches, public.cases, public.alerts, public.post_metrics to authenticated;
grant update on public.cases, public.alerts to authenticated;
grant select on public.audit_log to authenticated;

create policy analysts_read on public.analysts
for select to authenticated using (public.is_analyst());

create policy posts_read on public.posts
for select to authenticated using (public.is_analyst());

create policy analyses_read on public.analyses
for select to authenticated using (public.is_analyst());

create policy fact_checks_read on public.fact_checks
for select to authenticated using (public.is_analyst());

create policy matches_read on public.matches
for select to authenticated using (public.is_analyst());

create policy metrics_read on public.post_metrics
for select to authenticated using (public.is_analyst());

create policy cases_read on public.cases
for select to authenticated using (public.is_analyst());

create policy cases_update on public.cases
for update to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()))
with check (public.is_admin() or assigned_to = (select auth.uid()));

create policy alerts_read on public.alerts
for select to authenticated using (public.is_analyst());

create policy alerts_update on public.alerts
for update to authenticated
using (public.is_admin() or assigned_to = (select auth.uid()))
with check (public.is_admin() or assigned_to = (select auth.uid()));

create policy audit_read on public.audit_log
for select to authenticated using (public.is_admin());

-- Tidak ada kebijakan insert untuk authenticated pada tabel pipeline.
-- Penulisan analisis memakai service_role di server, yang melewati RLS.
-- anon tidak menerima kebijakan: tolak secara bawaan.
