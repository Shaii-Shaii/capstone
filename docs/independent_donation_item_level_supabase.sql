-- OBSOLETE for the current donor schema. Do not run this against the updated
-- database unless you intentionally want to reintroduce removed item QR columns.
-- Independent donation item-level tracking support.

ALTER TABLE public.Hair_Submission_Details
ADD COLUMN IF NOT EXISTS Hair_Item_Code character varying UNIQUE,
ADD COLUMN IF NOT EXISTS Hair_Owner_Type character varying DEFAULT 'Self',
ADD COLUMN IF NOT EXISTS Hair_Owner_Display_Name character varying,
ADD COLUMN IF NOT EXISTS Relationship_To_Submitter character varying,
ADD COLUMN IF NOT EXISTS Input_Method character varying DEFAULT 'Manual',
ADD COLUMN IF NOT EXISTS Consent_Confirmed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS Consent_Confirmed_At timestamp without time zone,
ADD COLUMN IF NOT EXISTS QR_Token character varying UNIQUE,
ADD COLUMN IF NOT EXISTS QR_Image_Path character varying,
ADD COLUMN IF NOT EXISTS QR_Status character varying DEFAULT 'Not Generated',
ADD COLUMN IF NOT EXISTS QR_Generated_At timestamp without time zone,
ADD COLUMN IF NOT EXISTS Current_Tracking_Status character varying DEFAULT 'Draft',
ADD COLUMN IF NOT EXISTS Rejection_Reason text;

ALTER TABLE public.AI_Screenings
ADD COLUMN IF NOT EXISTS Submission_Detail_ID integer
REFERENCES public.Hair_Submission_Details(Submission_Detail_ID);

CREATE TABLE IF NOT EXISTS public.Hair_Submission_Logistics_Items (
  Logistics_Item_ID integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  Submission_Logistics_ID integer NOT NULL REFERENCES public.Hair_Submission_Logistics(Submission_Logistics_ID),
  Submission_Detail_ID integer NOT NULL REFERENCES public.Hair_Submission_Details(Submission_Detail_ID),
  Item_Logistics_Status character varying DEFAULT 'Pending',
  Last_Scanned_At timestamp without time zone,
  Received_At timestamp without time zone,
  Received_By integer REFERENCES public.users(user_id),
  UNIQUE (Submission_Logistics_ID, Submission_Detail_ID)
);

CREATE INDEX IF NOT EXISTS idx_hair_submission_details_submission_id
ON public.Hair_Submission_Details (Submission_ID);

CREATE INDEX IF NOT EXISTS idx_hair_submission_details_qr_token
ON public.Hair_Submission_Details (QR_Token);

CREATE INDEX IF NOT EXISTS idx_hair_bundle_tracking_history_detail
ON public.Hair_Bundle_Tracking_History (Submission_Detail_ID, Updated_At);
