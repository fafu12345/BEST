begin;
-- Unknown existing directions remain NULL; old API payloads can omit this field.
alter table public.properties add column direction text check(direction in ('south','north','west','east'));
create index properties_office_direction_idx on public.properties(office_id,direction) where deleted_at is null and direction is not null;
commit;
