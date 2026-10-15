begin;
-- User-requested history deletion. No INSERT/UPDATE privileges; business writes still produce history.
grant delete on public.property_change_history to authenticated;
create policy assigned_history_delete on public.property_change_history for delete to authenticated
using(office_id=(select private.office_id()) and exists(
 select 1 from public.properties p where p.id=property_change_history.property_id
 and p.office_id=property_change_history.office_id and p.deleted_at is null
 and ((select private.is_manager()) or p.assigned_staff_id=(select private.staff_id()))
));
commit;
