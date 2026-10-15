-- Supabase's full DB image normally installs these infrastructure privileges.
-- The lightweight PostgreSQL image needs them after Storage's own migrations.
grant usage on schema storage to authenticated,service_role;
grant select on storage.buckets to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
grant all on all tables in schema storage to service_role;
grant usage,select on all sequences in schema storage to service_role;
grant execute on all functions in schema storage to authenticated,service_role;
