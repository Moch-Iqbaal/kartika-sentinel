-- Catatan analis pada berkas. Tambahan setelah 0001.
alter table public.cases add column if not exists analyst_note text;
