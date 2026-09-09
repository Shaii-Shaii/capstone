begin;

-- Hair_Submission_Details is the editable physical-review copy. Initialize
-- only missing values when the row is first inserted, using the exact AI
-- screening linked by Hair_Submissions.AI_Screening_ID.
create or replace function public.initialize_hair_submission_details_from_linked_ai()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  linked_screening record;
begin
  select
    ai."Estimated_Length" as estimated_length,
    ai."Detected_Color" as detected_color,
    ai."Detected_Texture" as detected_texture,
    ai."Detected_Density" as detected_density,
    ai."Detected_Condition" as detected_condition
  into linked_screening
  from public."Hair_Submissions" submission
  join public."AI_Screenings" ai
    on ai."AI_Screening_ID" = submission."AI_Screening_ID"
  where submission."Submission_ID" = new."Submission_ID";

  if not found then
    return new;
  end if;

  if new."Declared_Length" is null then
    new."Declared_Length" := linked_screening.estimated_length;
  end if;
  if new."Declared_Color" is null then
    new."Declared_Color" := linked_screening.detected_color;
  end if;
  if new."Declared_Texture" is null then
    new."Declared_Texture" := linked_screening.detected_texture;
  end if;
  if new."Declared_Density" is null then
    new."Declared_Density" := linked_screening.detected_density;
  end if;
  if new."Declared_Condition" is null then
    new."Declared_Condition" := linked_screening.detected_condition;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_00_initialize_hair_submission_details_from_linked_ai
on public."Hair_Submission_Details";

create trigger trg_00_initialize_hair_submission_details_from_linked_ai
before insert on public."Hair_Submission_Details"
for each row
execute function public.initialize_hair_submission_details_from_linked_ai();

-- Trigger functions are not callable application endpoints.
revoke all on function public.initialize_hair_submission_details_from_linked_ai()
from public, anon, authenticated;

comment on function public.initialize_hair_submission_details_from_linked_ai() is
  'Initializes null physical-review fields once from the exact AI screening linked to the parent hair submission.';

commit;
