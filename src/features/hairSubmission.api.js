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

export const createHairSubmission = async (payload) => {
  const { userId, error } = await resolveSubmissionUserId(payload?.user_id);
  if (error) {
    return { data: null, error };
  }

  return await supabase
    .from('hair_submissions')
    .insert([{
      ...payload,
      user_id: userId,
    }])
    .select()
    .single();
};

export const createHairSubmissionDetail = async (payload) => (
  await supabase
    .from('hair_submission_details')
    .insert([payload])
    .select()
    .single()
);

export const createHairSubmissionImages = async (rows) => (
  await supabase
    .from('hair_submission_images')
    .insert(rows)
    .select()
);

export const createAiScreening = async (payload) => (
  await supabase
    .from('ai_screenings')
    .insert([payload])
    .select()
    .single()
);

export const createDonorRecommendations = async (rows) => (
  await supabase
    .from('donor_recommendations')
    .insert(rows)
    .select()
);

export const fetchDonorRecommendationsBySubmissionId = async (submissionId, limit = 5) => (
  await supabase
    .from('donor_recommendations')
    .select(`
      id,
      submission_id,
      title,
      recommendation_text,
      priority_order,
      created_at
    `)
    .eq('submission_id', submissionId)
    .order('priority_order', { ascending: true })
    .limit(limit)
);

export const fetchHairSubmissionsByUserId = async (userId, limit = 10) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: [], error: resolvedUserId.error };
  }

  return await supabase
    .from('hair_submissions')
    .select(`
      id,
      submission_code,
      bundle_quantity,
      status,
      created_at,
      ai_screenings (
        id,
        decision,
        summary,
        confidence_score,
        created_at
      )
    `)
    .eq('user_id', resolvedUserId.userId)
    .order('created_at', { ascending: false })
    .limit(limit);
};

export const fetchLatestHairSubmissionByUserId = async (userId) => {
  const resolvedUserId = await resolveSubmissionUserId(userId);
  if (resolvedUserId.error) {
    return { data: null, error: resolvedUserId.error };
  }

  return await supabase
    .from('hair_submissions')
    .select(`
      id,
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
};

export const fetchLatestHairSubmissionDetailBySubmissionId = async (submissionId) => (
  await supabase
    .from('hair_submission_details')
    .select(`
      id,
      submission_id,
      bundle_number,
      declared_length,
      declared_condition,
      detail_notes,
      status,
      created_at,
      updated_at
    `)
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
);

export const fetchHairSubmissionLogisticsBySubmissionId = async (submissionId) => (
  await supabase
    .from('hair_submission_logistics')
    .select(`
      id,
      submission_id,
      logistics_type,
      courier_name,
      tracking_number,
      shipment_status,
      pickup_schedule_at,
      pickup_schedule_date,
      pickup_approved_at,
      received_at,
      notes,
      created_at,
      updated_at
    `)
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
);

export const fetchLatestQaAssessmentBySubmissionDetailId = async (submissionDetailId) => (
  await supabase
    .from('qa_assessments')
    .select(`
      id,
      submission_detail_id,
      assessment_result,
      remarks,
      assessed_at
    `)
    .eq('submission_detail_id', submissionDetailId)
    .order('assessed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
);

export const fetchHairBundleTrackingHistory = async ({ submissionId, submissionDetailId, limit = 6 }) => {
  const query = supabase
    .from('hair_bundle_tracking_history')
    .select(`
      id,
      submission_id,
      submission_detail_id,
      status,
      title,
      description,
      updated_at
    `)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (submissionId && submissionDetailId) {
    return await query.or(`submission_id.eq.${submissionId},submission_detail_id.eq.${submissionDetailId}`);
  }

  if (submissionId) {
    return await query.eq('submission_id', submissionId);
  }

  if (submissionDetailId) {
    return await query.eq('submission_detail_id', submissionDetailId);
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
