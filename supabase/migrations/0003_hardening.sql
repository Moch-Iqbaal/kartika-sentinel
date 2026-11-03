revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_analyst() from public, anon;
revoke execute on function public.purge_old_data() from public, anon, authenticated;
revoke execute on function public.audit_row_change() from public, anon, authenticated;

-- rls_auto_enable is created by the Supabase dashboard as an event trigger.
-- It is not present on every project, so skip the revoke when it is absent.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'rls_auto_enable'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon';
  end if;
end;
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_analyst() to authenticated;
grant execute on function public.purge_old_data() to service_role;

create index if not exists alerts_analysis_id_idx on public.alerts (analysis_id);
create index if not exists alerts_assigned_to_idx on public.alerts (assigned_to);
create index if not exists alerts_case_id_idx on public.alerts (case_id);
create index if not exists analyses_post_id_idx on public.analyses (post_id);
create index if not exists cases_assigned_to_idx on public.cases (assigned_to);
create index if not exists cases_created_by_idx on public.cases (created_by);
create index if not exists matches_fact_check_id_idx on public.matches (fact_check_id);
