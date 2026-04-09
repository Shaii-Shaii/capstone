import { supabase } from '../api/supabase/client';
import { hairSubmissionStorageBucket } from './hairSubmission.constants';
import { resolveDatabaseUserId } from './profile/api/profile.api';
import { logAppError, logAppEvent } from '../utils/appErrors';

const hairSubmissionsTable = 'Hair_Submissions';
const hairSubmissionDetailsTable = 'Hair_Submission_Details';
const hairSubmissionImagesTable = 'Hair_Submission_Images';
const hairSubmissionLogisticsTable = 'Hair_Submission_Logistics';
const hairBundleTrackingHistoryTable = 'Hair_Bundle_Tracking_History';
const qaAssessmentsTable = 'QA_Assessments';
const aiScreeningsTable = 'AI_Screenings';
const donorRecommendationsTable = 'Donor_Recommendations';

const hairSubmissionSelect = `
  submission_id:Submission_ID,
  user_id:User_ID,
  donation_drive_id:Donation_Drive_ID,
  organization_id:Organization_ID,
  delivery_method:Delivery_Method,
  pickup_request:Pickup_Request,
  submission_code:Submission_Code,
  donation_source:Donation_Source,
  bundle_quantity:Bundle_Quantity,
  donor_notes:Donor_Notes,
  status:Status,
  created_at:Created_At,
  updated_at:Updated_At
`;

const hairSubmissionDetailSelect = `
  submission_detail_id:Submission_Detail_ID,
  submission_id:Submission_ID,
  bundle_number:Bundle_Number,
  declared_length:Declared_Length,
  declared_color:Declared_Color,
  declared_texture:Declared_Texture,
  declared_density:Declared_Density,
  declared_condition:Declared_Condition,
  is_chemically_treated:Is_Chemically_Treated,
  is_colored:Is_Colored,
  is_bleached:Is_Bleached,
  is_rebonded:Is_Rebonded,
  detail_notes:Detail_Notes,
  status:Status,
  created_at:Created_At,
  updated_at:Updated_At
`;

const hairSubmissionImageSelect = `
  image_id:Image_ID,
  submission_detail_id:Submission_Detail_ID,
  file_path:File_Path,
  image_type:Image_Type,
  uploaded_at:Uploaded_At
`;

const aiScreeningSelect = `
  ai_screening_id:AI_Screening_ID,
  submission_id:Submission_ID,
  estimated_length:Estimated_Length,
  detected_texture:Detected_Texture,
  detected_density:Detected_Density,
  detected_condition:Detected_Condition,
  visible_damage_notes:Visible_Damage_Notes,
  confidence_score:Confidence_Score,
  decision:Decision,
  summary:Summary,
  created_at:Created_At
`;

const donorRecommendationSelect = `
  recommendation_id:Recommendation_ID,
  submission_id:Submission_ID,
  title:Title,
  recommendation_text:Recommendation_Text,
  priority_order:Priority_Order,
  created_at:Created_At
`;

const hairSubmissionLogisticsSelect = `
  submission_logistics_id:Submission_Logistics_ID,
  submission_id:Submission_ID,
  logistics_type:Logistics_Type,
  courier_name:Courier_Name,
  tracking_number:Tracking_Number,
  shipment_status:Shipment_Status,
  pickup_scheduled_at:Pickup_Scheduled_At,
  pickup_schedule_date:Pickup_Schedule_Date,
  pickup_approved_at:Pickup_Approved_At,
  received_by:Received_By,
  received_at:Received_At,
  notes:Notes,
  created_at:Created_At
`;

const qaAssessmentSelect = `
  qa_assessment_id:QA_Assessment_ID,
  submission_detail_id:Submission_Detail_ID,
  assessed_by:Assessed_By,
  assessment_result:Assessment_Result,
  remarks:Remarks,
  assessed_at:Assessed_At
`;

const trackingEntrySelect = `
  tracking_id:Tracking_ID,
  submission_id:Submission_ID,
  submission_detail_id:Submission_Detail_ID,
  status:Status,
  title:Title,
  description:Description,
  changed_by:Changed_By,
  updated_at:Updated_At
`;

const logHairQuery = (source, extras = {}) => {
  logAppEvent('hair_submission.query', 'Hair submission query started.', {
    source,
    ...extras,
  });
};

const resolveSubmissionUserId = async (userId) => {
  const result = await resolveDatabaseUserId(userId, { ensure: false });
  if (result.error || !result.data) {
    return {
      userId: null,
      error: result.error || new Error('The logged-in account is not linked to a donor record.'),
    };
  }

  return {
    userId: result.data,
    error: null,
  };
};

const normalizeAiScreening = (row) => ({
  id: row?.ai_screening_id || null,
  ai_screening_id: row?.ai_screening_id || null,
  submission_id: row?.submission_id || null,
  estimated_length: row?.estimated_length ?? null,
  detected_texture: row?.detected_texture || '',
  detected_density: row?.detected_density || '',
  detected_condition: row?.detected_condition || '',
  visible_damage_notes: row?.visible_damage_notes || '',
  confidence_score: row?.confidence_score ?? null,
  decision: row?.decision || '',
  summary: row?.summary || '',
  created_at: row?.created_at || null,
});

const normalizeDonorRecommendation = (row) => ({
  id: row?.recommendation_id || null,
  recommendation_id: row?.recommendation_id || null,
  submission_id: row?.submission_id || null,
  title: row?.title || '',
  recommendation_text: row?.recommendation_text || '',
  priority_order: row?.priority_order ?? null,
  created_at: row?.created_at || null,
});

const normalizeHairSubmission = (row) => ({
  id: row?.submission_id || null,
  submission_id: row?.submission_id || null,
  user_id: row?.user_id || null,
  donation_drive_id: row?.donation_drive_id || null,
  organization_id: row?.organization_id || null,
  delivery_method: row?.delivery_method || '',
  pickup_request: Boolean(row?.pickup_request),
  submission_code: row?.submission_code || '',
  donation_source: row?.donation_source || '',
  bundle_quantity: row?.bundle_quantity ?? 0,
  donor_notes: row?.donor_notes || '',
  status: row?.status || '',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  ai_screenings: Array.isArray(row?.ai_screenings)
    ? row.ai_screenings.map(normalizeAiScreening)
    : row?.ai_screenings
      ? normalizeAiScreening(row.ai_screenings)
      : [],
});

const normalizeHairSubmissionDetail = (row) => ({
  id: row?.submission_detail_id || null,
  submission_detail_id: row?.submission_detail_id || null,
  submission_id: row?.submission_id || null,
  bundle_number: row?.bundle_number ?? null,
  declared_length: row?.declared_length ?? null,
  declared_color: row?.declared_color || '',
  declared_texture: row?.declared_texture || '',
  declared_density: row?.declared_density || '',
  declared_condition: row?.declared_condition || '',
  is_chemically_treated: Boolean(row?.is_chemically_treated),
  is_colored: Boolean(row?.is_colored),
  is_bleached: Boolean(row?.is_bleached),
  is_rebonded: Boolean(row?.is_rebonded),
  detail_notes: row?.detail_notes || '',
  status: row?.status || '',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
});

const normalizeHairSubmissionLogistics = (row) => ({
  id: row?.submission_logistics_id || null,
  submission_logistics_id: row?.submission_logistics_id || null,
  submission_id: row?.submission_id || null,
  logistics_type: row?.logistics_type || '',
  courier_name: row?.courier_name || '',
  tracking_number: row?.tracking_number || '',
  shipment_status: row?.shipment_status || '',
  pickup_schedule_at: row?.pickup_scheduled_at || row?.pickup_schedule_at || null,
  pickup_schedule_date: row?.pickup_schedule_date || null,
  pickup_approved_at: row?.pickup_approved_at || null,
  received_by: row?.received_by || null,
  received_at: row?.received_at || null,
  notes: row?.notes || '',
  created_at: row?.created_at || null,
  updated_at: row?.received_at || row?.pickup_approved_at || row?.pickup_scheduled_at || row?.created_at || null,
});

const normalizeQaAssessment = (row) => ({
  id: row?.qa_assessment_id || null,
  qa_assessment_id: row?.qa_assessment_id || null,
  submission_detail_id: row?.submission_detail_id || null,
  assessed_by: row?.assessed_by || null,
  assessment_result: row?.assessment_result || '',
  remarks: row?.remarks || '',
  assessed_at: row?.assessed_at || null,
});

const normalizeTrackingEntry = (row) => ({
  id: row?.tracking_id || null,
  tracking_id: row?.tracking_id || null,
  submission_id: row?.submission_id || null,
  submission_detail_id: row?.submission_detail_id || null,
  status: row?.status || '',
  title: row?.title || '',
  description: row?.description || '',
  changed_by: row?.changed_by || null,
  updated_at: row?.updated_at || null,
});

export const createHairSubmission = async (payload) => {
  const { userId, error } = await resolveSubmissionUserId(payload?.user_id);
  if (error) {
    return { data: null, error };
  }

  logHairQuery('createHairSubmission', {
    table: hairSubmissionsTable,
    phase: 'create',
    userId,
    columns: ['User_ID', 'Submission_Code', 'Bundle_Quantity', 'Donation_Source', 'Status', 'Donor_Notes'],
  });

  const result = await supabase
    .from(hairSubmissionsTable)
    .insert([{
      User_ID: userId,
      Donation_Drive_ID: payload?.donation_drive_id || null,
      Organization_ID: payload?.organization_id || null,
      Delivery_Method: payload?.delivery_method || null,
      Pickup_Request: payload?.pickup_request ?? false,
      Submission_Code: payload?.submission_code || null,
      Donation_Source: payload?.donation_source || null,
      Bundle_Quantity: payload?.bundle_quantity ?? null,
      Donor_Notes: payload?.donor_notes || null,
      Status: payload?.status || null,
    }])
    .select(hairSubmissionSelect)
    .single();

  return {
    data: result.data ? normalizeHairSubmission(result.data) : null,
    error: result.error,
  };
};

export const createHairSubmissionDetail = async (payload) => {
  logHairQuery('createHairSubmissionDetail', {
    table: hairSubmissionDetailsTable,
    phase: 'create',
    filters: { Submission_ID: payload?.submission_id },
    columns: ['Submission_ID', 'Bundle_Number', 'Declared_Length', 'Declared_Texture', 'Declared_Density', 'Declared_Condition', 'Detail_Notes', 'Status'],
  });

  const result = await supabase
    .from(hairSubmissionDetailsTable)
    .insert([{
      Submission_ID: payload?.submission_id || null,
      Bundle_Number: payload?.bundle_number ?? null,
      Declared_Length: payload?.declared_length ?? null,
      Declared_Color: payload?.declared_color || null,
      Declared_Texture: payload?.declared_texture || null,
      Declared_Density: payload?.declared_density || null,
      Declared_Condition: payload?.declared_condition || null,
      Is_Chemically_Treated: payload?.is_chemically_treated ?? false,
      Is_Colored: payload?.is_colored ?? false,
      Is_Bleached: payload?.is_bleached ?? false,
      Is_Rebonded: payload?.is_rebonded ?? false,
      Detail_Notes: payload?.detail_notes || null,
      Status: payload?.status || null,
    }])
    .select(hairSubmissionDetailSelect)
    .single();

  return {
    data: result.data ? normalizeHairSubmissionDetail(result.data) : null,
    error: result.error,
  };
};

export const createHairSubmissionImages = async (rows) => {
  const insertRows = rows.map((row) => ({
    Submission_Detail_ID: row?.submission_detail_id || null,
    File_Path: row?.file_path || null,
    Image_Type: row?.image_type || null,
  }));

  logHairQuery('createHairSubmissionImages', {
    table: hairSubmissionImagesTable,
    phase: 'create',
    rowCount: insertRows.length,
    columns: ['Submission_Detail_ID', 'File_Path', 'Image_Type'],
  });

  return await supabase
    .from(hairSubmissionImagesTable)
    .insert(insertRows)
    .select(hairSubmissionImageSelect);
};

export const createAiScreening = async (payload) => {
  logHairQuery('createAiScreening', {
    table: aiScreeningsTable,
    phase: 'create',
    filters: { Submission_ID: payload?.submission_id },
    columns: ['Submission_ID', 'Estimated_Length', 'Detected_Texture', 'Detected_Density', 'Detected_Condition', 'Visible_Damage_Notes', 'Confidence_Score', 'Decision', 'Summary'],
  });

  const result = await supabase
    .from(aiScreeningsTable)
    .insert([{
      Submission_ID: payload?.submission_id || null,
      Estimated_Length: payload?.estimated_length ?? null,
      Detected_Texture: payload?.detected_texture || null,
      Detected_Density: payload?.detected_density || null,
      Detected_Condition: payload?.detected_condition || null,
      Visible_Damage_Notes: payload?.visible_damage_notes || null,
      Confidence_Score: payload?.confidence_score ?? null,
      Decision: payload?.decision || null,
      Summary: payload?.summary || null,
    }])
    .select(aiScreeningSelect)
    .single();

  return {
    data: result.data ? normalizeAiScreening(result.data) : null,
    error: result.error,
  };
};

export const createDonorRecommendations = async (rows) => {
  const insertRows = rows.map((row) => ({
    Submission_ID: row?.submission_id || null,
    Title: row?.title || null,
    Recommendation_Text: row?.recommendation_text || null,
    Priority_Order: row?.priority_order ?? null,
  }));

  logHairQuery('createDonorRecommendations', {
    table: donorRecommendationsTable,
    phase: 'create',
    rowCount: insertRows.length,
    columns: ['Submission_ID', 'Title', 'Recommendation_Text', 'Priority_Order'],
  });

  const result = await supabase
    .from(donorRecommendationsTable)
    .insert(insertRows)
    .select(donorRecommendationSelect);

  return {
    data: (result.data || []).map(normalizeDonorRecommendation),
    error: result.error,
  };
};

export const fetchDonorRecommendationsBySubmissionId = async (submissionId, limit = 5) => {
  logHairQuery('fetchDonorRecommendationsBySubmissionId', {
    table: donorRecommendationsTable,
    phase: 'read',
    filters: { Submission_ID: submissionId },
    columns: ['Recommendation_ID', 'Submission_ID', 'Title', 'Recommendation_Text', 'Priority_Order', 'Created_At'],
  });

  const result = await supabase
    .from(donorRecommendationsTable)
    .select(donorRecommendationSelect)
    .eq('Submission_ID', submissionId)
    .order('Priority_Order', { ascending: true })
    .limit(limit);

  return {
    data: (result.data || []).map(normalizeDonorRecommendation),
    error: result.error,
  };
};

export const fetchHairSubmissionsByUserId = async (userId, limit = 10) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: [], error: resolvedUserId.error };
  }

  logHairQuery('fetchHairSubmissionsByUserId', {
    table: hairSubmissionsTable,
    phase: 'read',
    filters: { User_ID: resolvedUserId.userId },
    columns: ['Submission_ID', 'User_ID', 'Submission_Code', 'Bundle_Quantity', 'Status', 'Donor_Notes', 'Created_At', 'Updated_At'],
  });

  const result = await supabase
    .from(hairSubmissionsTable)
    .select(hairSubmissionSelect)
    .eq('User_ID', resolvedUserId.userId)
    .order('Created_At', { ascending: false })
    .limit(limit);

  if (result.error || !(result.data || []).length) {
    return {
      data: (result.data || []).map(normalizeHairSubmission),
      error: result.error,
    };
  }

  const submissionIds = result.data.map((row) => row?.submission_id).filter(Boolean);

  const screeningsResult = await supabase
    .from(aiScreeningsTable)
    .select(aiScreeningSelect)
    .in('Submission_ID', submissionIds)
    .order('Created_At', { ascending: false });

  if (screeningsResult.error) {
    logAppError('hair_submission.query.fetchHairSubmissionsByUserId.screenings', screeningsResult.error, {
      table: aiScreeningsTable,
      phase: 'read',
      submissionIds,
    });
  }

  const screeningsBySubmissionId = new Map();
  (screeningsResult.data || []).forEach((row) => {
    const screening = normalizeAiScreening(row);
    const currentRows = screeningsBySubmissionId.get(screening.submission_id) || [];
    currentRows.push(screening);
    screeningsBySubmissionId.set(screening.submission_id, currentRows);
  });

  return {
    data: (result.data || []).map((row) => normalizeHairSubmission({
      ...row,
      ai_screenings: screeningsBySubmissionId.get(row?.submission_id) || [],
    })),
    error: result.error,
  };
};

export const fetchLatestHairSubmissionByUserId = async (userId) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: null, error: resolvedUserId.error };
  }

  logHairQuery('fetchLatestHairSubmissionByUserId', {
    table: hairSubmissionsTable,
    phase: 'read',
    filters: { User_ID: resolvedUserId.userId },
    columns: ['Submission_ID', 'User_ID', 'Submission_Code', 'Bundle_Quantity', 'Donor_Notes', 'Status', 'Created_At', 'Updated_At'],
  });

  const result = await supabase
    .from(hairSubmissionsTable)
    .select(hairSubmissionSelect)
    .eq('User_ID', resolvedUserId.userId)
    .order('Created_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmission(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestHairSubmissionDetailBySubmissionId = async (submissionId) => {
  logHairQuery('fetchLatestHairSubmissionDetailBySubmissionId', {
    table: hairSubmissionDetailsTable,
    phase: 'read',
    filters: { Submission_ID: submissionId },
    columns: ['Submission_Detail_ID', 'Submission_ID', 'Bundle_Number', 'Declared_Length', 'Declared_Texture', 'Declared_Density', 'Declared_Condition', 'Detail_Notes', 'Status', 'Created_At', 'Updated_At'],
  });

  const result = await supabase
    .from(hairSubmissionDetailsTable)
    .select(hairSubmissionDetailSelect)
    .eq('Submission_ID', submissionId)
    .order('Created_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmissionDetail(result.data) : null,
    error: result.error,
  };
};

export const fetchHairSubmissionLogisticsBySubmissionId = async (submissionId) => {
  logHairQuery('fetchHairSubmissionLogisticsBySubmissionId', {
    table: hairSubmissionLogisticsTable,
    phase: 'read',
    filters: { Submission_ID: submissionId },
    columns: ['Submission_Logistics_ID', 'Submission_ID', 'Logistics_Type', 'Courier_Name', 'Tracking_Number', 'Shipment_Status', 'Pickup_Scheduled_At', 'Pickup_Schedule_Date', 'Pickup_Approved_At', 'Received_By', 'Received_At', 'Notes', 'Created_At'],
  });

  const result = await supabase
    .from(hairSubmissionLogisticsTable)
    .select(hairSubmissionLogisticsSelect)
    .eq('Submission_ID', submissionId)
    .order('Created_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmissionLogistics(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestQaAssessmentBySubmissionDetailId = async (submissionDetailId) => {
  logHairQuery('fetchLatestQaAssessmentBySubmissionDetailId', {
    table: qaAssessmentsTable,
    phase: 'read',
    filters: { Submission_Detail_ID: submissionDetailId },
    columns: ['QA_Assessment_ID', 'Submission_Detail_ID', 'Assessed_By', 'Assessment_Result', 'Remarks', 'Assessed_At'],
  });

  const result = await supabase
    .from(qaAssessmentsTable)
    .select(qaAssessmentSelect)
    .eq('Submission_Detail_ID', submissionDetailId)
    .order('Assessed_At', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeQaAssessment(result.data) : null,
    error: result.error,
  };
};

export const fetchHairBundleTrackingHistory = async ({ submissionId, submissionDetailId, limit = 6 }) => {
  logHairQuery('fetchHairBundleTrackingHistory', {
    table: hairBundleTrackingHistoryTable,
    phase: 'read',
    filters: { Submission_ID: submissionId || null, Submission_Detail_ID: submissionDetailId || null },
    columns: ['Tracking_ID', 'Submission_ID', 'Submission_Detail_ID', 'Status', 'Title', 'Description', 'Changed_By', 'Updated_At'],
  });

  const query = supabase
    .from(hairBundleTrackingHistoryTable)
    .select(trackingEntrySelect)
    .order('Updated_At', { ascending: false })
    .limit(limit);

  if (submissionId && submissionDetailId) {
    const result = await query.or(`Submission_ID.eq.${submissionId},Submission_Detail_ID.eq.${submissionDetailId}`);
    return {
      data: (result.data || []).map(normalizeTrackingEntry),
      error: result.error,
    };
  }

  if (submissionId) {
    const result = await query.eq('Submission_ID', submissionId);
    return {
      data: (result.data || []).map(normalizeTrackingEntry),
      error: result.error,
    };
  }

  if (submissionDetailId) {
    const result = await query.eq('Submission_Detail_ID', submissionDetailId);
    return {
      data: (result.data || []).map(normalizeTrackingEntry),
      error: result.error,
    };
  }

  return { data: [], error: null };
};

export const uploadHairSubmissionImage = async ({ path, fileBody, contentType, bucket = hairSubmissionStorageBucket }) => (
  await supabase.storage
    .from(bucket)
    .upload(path, fileBody, {
      contentType,
      upsert: false,
    })
);
