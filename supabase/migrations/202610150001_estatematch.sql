-- EstateMatch baseline. Run on Supabase PostgreSQL as the migration owner.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.offices (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.staff (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id) on delete restrict,
 user_id uuid not null unique references auth.users(id) on delete restrict,
 display_name text not null check(length(trim(display_name)) between 1 and 80),
 role text not null check(role in ('owner','manager','agent')), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(office_id,id)
);
create unique index one_active_owner_per_office on public.staff(office_id) where role='owner' and active;
create table public.staff_invitations (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id),
 email text not null check(email=lower(email) and email like '%@%'), role text not null check(role in ('manager','agent')),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 invited_by uuid not null, approved_by uuid, approved_at timestamptz,
 expires_at timestamptz not null default (now()+interval '7 days'), accepted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,invited_by) references public.staff(office_id,id),
 foreign key(office_id,approved_by) references public.staff(office_id,id),
 check((approved_at is null)=(approved_by is null)), check(expires_at>created_at),
 check(accepted_at is null or approved_at is not null), unique(office_id,id)
);
create unique index one_pending_invitation on public.staff_invitations(office_id,email) where accepted_at is null;
create table public.properties (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 200), address text not null default '',
 property_type text not null check(property_type in ('apartment','house','office','retail','land','other')),
 transaction_type text not null check(transaction_type in ('sale','lease','rent')),
 price numeric(16,0) not null check(price>=0), deposit numeric(16,0) not null default 0 check(deposit>=0),
 area_m2 numeric(12,2) check(area_m2>0), status text not null default 'available' check(status in ('available','reserved','closed')),
 description text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id), unique(office_id,id,assigned_staff_id)
);
create table public.customers (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 name text not null check(length(trim(name)) between 1 and 100), phone text, email text,
 status text not null default 'active' check(status in ('active','inactive')), notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id), unique(office_id,id,assigned_staff_id)
);
create table public.property_images (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 property_id uuid not null, storage_path text not null unique, caption text not null default '', sort_order integer not null default 0 check(sort_order>=0),
 foreign key(office_id,property_id,assigned_staff_id) references public.properties(office_id,id,assigned_staff_id) on update cascade on delete cascade,
 check(storage_path like office_id::text || '/' || property_id::text || '/%'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id)
);
create table public.customer_requirements (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 customer_id uuid not null, transaction_type text not null check(transaction_type in ('sale','lease','rent')),
 preferred_area text not null default '', min_price numeric(16,0) not null default 0 check(min_price>=0), max_price numeric(16,0) check(max_price>=min_price), min_area_m2 numeric(12,2) check(min_area_m2>0), notes text not null default '',
 foreign key(office_id,customer_id,assigned_staff_id) references public.customers(office_id,id,assigned_staff_id) on update cascade on delete cascade,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id)
);
create table public.matches (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 property_id uuid not null, customer_id uuid not null, score integer check(score between 0 and 100),
 status text not null default 'suggested' check(status in ('suggested','contacted','accepted','rejected')), notes text not null default '',
 foreign key(office_id,property_id) references public.properties(office_id,id), foreign key(office_id,customer_id) references public.customers(office_id,id), unique(office_id,property_id,customer_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id)
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 property_id uuid, customer_id uuid, title text not null check(length(trim(title))>0), starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')), notes text not null default '', check(ends_at>starts_at),
 foreign key(office_id,property_id) references public.properties(office_id,id), foreign key(office_id,customer_id) references public.customers(office_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id)
);
create table public.consultations (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 customer_id uuid not null, property_id uuid, consulted_at timestamptz not null default now(), summary text not null check(length(trim(summary))>0),
 foreign key(office_id,customer_id) references public.customers(office_id,id), foreign key(office_id,property_id) references public.properties(office_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id)
);
create table public.contracts (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 property_id uuid not null, customer_id uuid not null, contract_number text not null, amount numeric(16,0) not null check(amount>=0), signed_at date,
 status text not null default 'draft' check(status in ('draft','signed','cancelled')), notes text not null default '', unique(office_id,contract_number),
 foreign key(office_id,property_id) references public.properties(office_id,id), foreign key(office_id,customer_id) references public.customers(office_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id)
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), office_id uuid not null references public.offices(id), assigned_staff_id uuid not null,
 customer_id uuid, property_id uuid, title text not null check(length(trim(title))>0), due_at timestamptz,
 status text not null default 'todo' check(status in ('todo','doing','done','cancelled')), notes text not null default '',
 foreign key(office_id,customer_id) references public.customers(office_id,id), foreign key(office_id,property_id) references public.properties(office_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(office_id,assigned_staff_id) references public.staff(office_id,id), unique(office_id,id)
);

-- Membership is read from protected database rows, never from editable JWT metadata.
create function private.office_id() returns uuid language sql stable security definer set search_path='' as $$
 select office_id from public.staff where user_id=(select auth.uid()) and active
$$;
create function private.staff_id() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.staff where user_id=(select auth.uid()) and active
$$;
create function private.is_manager() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff where user_id=(select auth.uid()) and active and role in ('owner','manager'))
$$;
revoke all on all functions in schema private from public;
grant execute on function private.office_id(),private.staff_id(),private.is_manager() to authenticated;
create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
 begin new.updated_at=clock_timestamp(); return new; end $$;
create function private.protect_tenant() returns trigger language plpgsql set search_path='' as $$
 begin
 if new.office_id is distinct from old.office_id then raise exception 'office_id is immutable' using errcode='42501'; end if;
 return new;
 end $$;
alter table public.offices enable row level security;
create trigger updated_at before update on public.offices for each row execute function private.touch_updated_at();
revoke all on public.offices from anon, authenticated;
alter table public.staff enable row level security;
create trigger updated_at before update on public.staff for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.staff for each row execute function private.protect_tenant();
create index staff_office_idx on public.staff(office_id);
revoke all on public.staff from anon, authenticated;
alter table public.staff_invitations enable row level security;
create trigger updated_at before update on public.staff_invitations for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.staff_invitations for each row execute function private.protect_tenant();
create index staff_invitations_office_idx on public.staff_invitations(office_id);
revoke all on public.staff_invitations from anon, authenticated;
alter table public.properties enable row level security;
create trigger updated_at before update on public.properties for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.properties for each row execute function private.protect_tenant();
create index properties_office_idx on public.properties(office_id);
revoke all on public.properties from anon, authenticated;
alter table public.customers enable row level security;
create trigger updated_at before update on public.customers for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.customers for each row execute function private.protect_tenant();
create index customers_office_idx on public.customers(office_id);
revoke all on public.customers from anon, authenticated;
alter table public.property_images enable row level security;
create trigger updated_at before update on public.property_images for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.property_images for each row execute function private.protect_tenant();
create index property_images_office_idx on public.property_images(office_id);
revoke all on public.property_images from anon, authenticated;
alter table public.customer_requirements enable row level security;
create trigger updated_at before update on public.customer_requirements for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.customer_requirements for each row execute function private.protect_tenant();
create index customer_requirements_office_idx on public.customer_requirements(office_id);
revoke all on public.customer_requirements from anon, authenticated;
alter table public.matches enable row level security;
create trigger updated_at before update on public.matches for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.matches for each row execute function private.protect_tenant();
create index matches_office_idx on public.matches(office_id);
revoke all on public.matches from anon, authenticated;
alter table public.appointments enable row level security;
create trigger updated_at before update on public.appointments for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.appointments for each row execute function private.protect_tenant();
create index appointments_office_idx on public.appointments(office_id);
revoke all on public.appointments from anon, authenticated;
alter table public.consultations enable row level security;
create trigger updated_at before update on public.consultations for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.consultations for each row execute function private.protect_tenant();
create index consultations_office_idx on public.consultations(office_id);
revoke all on public.consultations from anon, authenticated;
alter table public.contracts enable row level security;
create trigger updated_at before update on public.contracts for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.contracts for each row execute function private.protect_tenant();
create index contracts_office_idx on public.contracts(office_id);
revoke all on public.contracts from anon, authenticated;
alter table public.tasks enable row level security;
create trigger updated_at before update on public.tasks for each row execute function private.touch_updated_at();
create trigger protect_tenant before update on public.tasks for each row execute function private.protect_tenant();
create index tasks_office_idx on public.tasks(office_id);
revoke all on public.tasks from anon, authenticated;
grant select on public.offices,public.staff to authenticated;
grant update(name) on public.offices to authenticated;
grant select(id,office_id,email,role,invited_by,approved_by,approved_at,expires_at,accepted_at,created_at,updated_at) on public.staff_invitations to authenticated;
create policy office_read on public.offices for select to authenticated using(id=(select private.office_id()));
create policy office_update on public.offices for update to authenticated using(id=(select private.office_id()) and (select private.is_manager())) with check(id=(select private.office_id()) and (select private.is_manager()));
create policy staff_read on public.staff for select to authenticated using(office_id=(select private.office_id()));
create policy invitations_read on public.staff_invitations for select to authenticated using(office_id=(select private.office_id()) and (select private.is_manager()));
grant select,insert,update,delete on public.properties to authenticated;
create index properties_assignee_idx on public.properties(office_id,assigned_staff_id);
create policy tenant_read on public.properties for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.properties for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.properties for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.properties for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
grant select,insert,update,delete on public.customers to authenticated;
create index customers_assignee_idx on public.customers(office_id,assigned_staff_id);
create policy tenant_read on public.customers for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.customers for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.customers for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.customers for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
grant select,insert,update,delete on public.property_images to authenticated;
create index property_images_assignee_idx on public.property_images(office_id,assigned_staff_id);
create policy tenant_read on public.property_images for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.property_images for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.property_images for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.property_images for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
grant select,insert,update,delete on public.customer_requirements to authenticated;
create index customer_requirements_assignee_idx on public.customer_requirements(office_id,assigned_staff_id);
create policy tenant_read on public.customer_requirements for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.customer_requirements for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.customer_requirements for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.customer_requirements for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
grant select,insert,update,delete on public.matches to authenticated;
create index matches_assignee_idx on public.matches(office_id,assigned_staff_id);
create policy tenant_read on public.matches for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.matches for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.matches for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.matches for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
grant select,insert,update,delete on public.appointments to authenticated;
create index appointments_assignee_idx on public.appointments(office_id,assigned_staff_id);
create policy tenant_read on public.appointments for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.appointments for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.appointments for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.appointments for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
grant select,insert,update,delete on public.consultations to authenticated;
create index consultations_assignee_idx on public.consultations(office_id,assigned_staff_id);
create policy tenant_read on public.consultations for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.consultations for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.consultations for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.consultations for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
grant select,insert,update,delete on public.contracts to authenticated;
create index contracts_assignee_idx on public.contracts(office_id,assigned_staff_id);
create policy tenant_read on public.contracts for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.contracts for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.contracts for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.contracts for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
grant select,insert,update,delete on public.tasks to authenticated;
create index tasks_assignee_idx on public.tasks(office_id,assigned_staff_id);
create policy tenant_read on public.tasks for select to authenticated using(office_id=(select private.office_id()));
create policy assigned_insert on public.tasks for insert to authenticated with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_update on public.tasks for update to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id()))) with check(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create policy assigned_delete on public.tasks for delete to authenticated using(office_id=(select private.office_id()) and ((select private.is_manager()) or assigned_staff_id=(select private.staff_id())));
create index staff_invitations_invited_by_idx on public.staff_invitations(office_id,invited_by);
create index staff_invitations_approved_by_idx on public.staff_invitations(office_id,approved_by);
create index property_images_property_id_idx on public.property_images(office_id,property_id);
create index customer_requirements_customer_id_idx on public.customer_requirements(office_id,customer_id);
create index matches_property_id_idx on public.matches(office_id,property_id);
create index matches_customer_id_idx on public.matches(office_id,customer_id);
create index appointments_property_id_idx on public.appointments(office_id,property_id);
create index appointments_customer_id_idx on public.appointments(office_id,customer_id);
create index consultations_property_id_idx on public.consultations(office_id,property_id);
create index consultations_customer_id_idx on public.consultations(office_id,customer_id);
create index contracts_property_id_idx on public.contracts(office_id,property_id);
create index contracts_customer_id_idx on public.contracts(office_id,customer_id);
create index tasks_property_id_idx on public.tasks(office_id,property_id);
create index tasks_customer_id_idx on public.tasks(office_id,customer_id);

-- Only the server service role can consume approved invitations. Atomic FOR UPDATE prevents token reuse.
create function public.accept_staff_invitation(p_token_hash text,p_user_id uuid,p_display_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.staff_invitations; result uuid; account_email text;
begin
 select * into invitation from public.staff_invitations where token_hash=p_token_hash for update;
 if not found or invitation.accepted_at is not null or invitation.approved_at is null or invitation.expires_at<=now() then
 raise exception 'Invalid, expired, unapproved or consumed invitation'; end if;
 if not exists(select 1 from public.staff where id=invitation.approved_by and office_id=invitation.office_id and active and role in ('owner','manager')) then
 raise exception 'Approver is no longer authorized'; end if;
 select lower(email) into account_email from auth.users where id=p_user_id;
 if account_email is distinct from invitation.email then raise exception 'Invitation email mismatch'; end if;
 insert into public.staff(office_id,user_id,display_name,role) values(invitation.office_id,p_user_id,p_display_name,invitation.role) returning id into result;
 update public.staff_invitations set accepted_at=now() where id=invitation.id;
 return result;
end $$;
revoke all on function public.accept_staff_invitation(text,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_staff_invitation(text,uuid,text) to service_role;
grant all on all tables in schema public to service_role;
commit;
