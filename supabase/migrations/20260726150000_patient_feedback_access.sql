-- Extend the existing feedback module to authenticated patient accounts.

drop policy if exists "patients_insert_own_feedback" on public."Donor_Feedback";
create policy "patients_insert_own_feedback"
on public."Donor_Feedback"
for insert
with check (
  "User_ID" = public.current_app_user_id()
  and "App_Role" = 'patient'
  and "Status" = 'New'
);
