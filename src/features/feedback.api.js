import { supabase } from '../api/supabase/client';

const DONOR_FEEDBACK_TABLE = 'Donor_Feedback';

const donorFeedbackSelect = `
  feedback_id:Feedback_ID,
  user_id:User_ID,
  feedback_type:Feedback_Type,
  message:Message,
  source_route:Source_Route,
  app_role:App_Role,
  status:Status,
  created_at:Created_At,
  updated_at:Updated_At
`;

const normalizeFeedbackType = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['issue', 'suggestion', 'experience'].includes(normalized)
    ? normalized
    : 'issue';
};

export const submitFeedback = async ({
  databaseUserId,
  feedbackType,
  message,
  appRole = 'donor',
  sourceRoute,
}) => {
  const normalizedUserId = Number(databaseUserId);
  const normalizedMessage = String(message || '').replace(/\s+/g, ' ').trim();
  const normalizedRole = String(appRole || '').trim().toLowerCase();

  if (!Number.isFinite(normalizedUserId) || normalizedUserId <= 0) {
    return {
      data: null,
      error: new Error('Your account is required before submitting feedback.'),
    };
  }

  if (!['donor', 'patient'].includes(normalizedRole)) {
    return {
      data: null,
      error: new Error('This account role cannot submit feedback.'),
    };
  }

  if (normalizedMessage.length < 10) {
    return {
      data: null,
      error: new Error('Please write at least 10 characters before submitting feedback.'),
    };
  }

  const now = new Date().toISOString();
  return await supabase
    .from(DONOR_FEEDBACK_TABLE)
    .insert([{
      User_ID: normalizedUserId,
      Feedback_Type: normalizeFeedbackType(feedbackType),
      Message: normalizedMessage,
      Source_Route: sourceRoute || `/${normalizedRole}/feedback`,
      App_Role: normalizedRole,
      Status: 'New',
      Created_At: now,
      Updated_At: now,
    }])
    .select(donorFeedbackSelect)
    .single();
};

export const submitDonorFeedback = (options) =>
  submitFeedback({ ...options, appRole: 'donor' });
