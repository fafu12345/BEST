begin;
alter table public.properties add column is_priority boolean not null default false;
create index properties_office_priority_idx on public.properties(office_id,is_priority desc,created_at desc,id) where deleted_at is null;
commit;
