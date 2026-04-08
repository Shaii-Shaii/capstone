import { supabase } from '../api/supabase/client';
import { hairSubmissionStorageBucket } from './hairSubmission.constants';
import { resolveDatabaseUserId } from './profile/api/profile.api';

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

  const result = await supabase
    .from('hair_submissions')
    .insert([{
      ...payload,
      user_id: userId,
    }])
    .select()
    .single();

  return {
    data: result.data ? normalizeHairSubmission(result.data) : null,
    error: result.error,
  };
};

export const createHairSubmissionDetail = async (payload) => {
  const result = await supabase
    .from('hair_submission_details')
    .insert([payload])
    .select()
    .single();

  return {
    data: result.data ? normalizeHairSubmissionDetail(result.data) : null,
    error: result.error,
  };
};

export const createHairSubmissionImages = async (rows) => (
  await supabase
    .from('hair_submission_images')
    .insert(rows)
    .select()
);

export const createAiScreening = async (payload) => {
  const result = await supabase
    .from('ai_screenings')
    .insert([payload])
    .select()
    .single();

  return {
    data: result.data ? normalizeAiScreening(result.data) : null,
    error: result.error,
  };
};

export const createDonorRecommendations = async (rows) => {
  const result = await supabase
    .from('donor_recommendations')
    .insert(rows)
    .select();

  return {
    data: (result.data || []).map(normalizeDonorRecommendation),
    error: result.error,
  };
};

export const fetchDonorRecommendationsBySubmissionId = async (submissionId, limit = 5) => {
  const result = await supabase
    .from('donor_recommendations')
    .select(`
      recommendation_id,
      submission_id,
      title,
      recommendation_text,
      priority_order,
      created_at
    `)
    .eq('submission_id', submissionId)
    .order('priority_order', { ascending: true })
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

  const result = await supabase
    .from('hair_submissions')
    .select(`
      submission_id,
      user_id,
      submission_code,
      bundle_quantity,
      status,
      donor_notes,
      created_at,
      updated_at,
      ai_screenings (
        ai_screening_id,
        submission_id,
        decision,
        summary,
        confidence_score,
        created_at
      )
    `)
    .eq('user_id', resolvedUserId.userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return {
    data: (result.data || []).map(normalizeHairSubmission),
    error: result.error,
  };
};

export const fetchLatestHairSubmissionByUserId = async (userId) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: null, error: resolvedUserId.error };
  }

  const result = await supabase
    .from('hair_submissions')
    .select(`
      submission_id,
      user_id,
      submission_code,
      bundle_quantity,
      donor_notes,
      status,
      created_at,
      updated_at
    `)
    .eq('user_id', resolvedUserId.userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmission(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestHairSubmissionDetailBySubmissionId = async (submissionId) => {
  const result = await supabase
    .from('hair_submission_details')
    .select(`
      submission_detail_id,
      submission_id,
      bundle_number,
      declared_length,
      declared_texture,
      declared_density,
      declared_condition,
      detail_notes,
      status,
      created_at,
      updated_at
    `)
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmissionDetail(result.data) : null,
    error: result.error,
  };
};

export const fetchHairSubmissionLogisticsBySubmissionId = async (submissionId) => {
  const result = await supabase
    .from('hair_submission_logistics')
    .select(`
      submission_logistics_id,
      submission_id,
      logistics_type,
      courier_name,
      tracking_number,
      shipment_status,
      pickup_scheduled_at,
      pickup_schedule_date,
      pickup_approved_at,
      received_by,
      received_at,
      notes,
      created_at
    `)
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeHairSubmissionLogistics(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestQaAssessmentBySubmissionDetailId = async (submissionDetailId) => {
  const result = await supabase
    .from('qa_assessments')
    .select(`
      qa_assessment_id,
      submission_detail_id,
      assessed_by,
      assessment_result,
      remarks,
      assessed_at
    `)
    .eq('submission_detail_id', submissionDetailId)
    .order('assessed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    data: result.data ? normalizeQaAssessment(result.data) : null,
    error: result.error,
  };
};

export const fetchHairBundleTrackingHistory = async ({ submissionId, submissionDetailId, limit = 6 }) => {
  const query = supabase
    .from('hair_bundle_tracking_history')
    .select(`
      tracking_id,
      submission_id,
      submission_detail_id,
      status,
      title,
      description,
      changed_by,
      updated_at
    `)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (submissionId && submissionDetailId) {
    const result = await query.or(`submission_id.eq.${submissionId},submission_detail_id.eq.${submissionDetailId}`);
    return {
      data: (result.data || []).map(normalizeTrackingEntry),
      error: result.error,
    };
  }

  if (submissionId) {
    const result = await query.eq('submission_id', submissionId);
    return {
      data: (result.data || []).map(normalizeTrackingEntry),
      error: result.error,
    };
  }

  if (submissionDetailId) {
    const result = await query.eq('submission_detail_id', submissionDetailId);
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
