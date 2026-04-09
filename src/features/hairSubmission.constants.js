export const hairSubmissionStatuses = {
  submission: {
    submitted: 'submitted',
  },
  detail: {
    pending: 'pending',
  },
};

export const hairSubmissionImageTypes = {
  donorUpload: 'donor_upload',
};

export const hairAnalysisRequiredViews = [
  { key: 'top_scalp', label: 'Top (Scalp)' },
  { key: 'front', label: 'Front' },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
];

export const hairAnalyzerConcernTypes = {
  hairLoss: 'hair_loss',
  donationEligibility: 'donation_eligibility',
};

export const hairAnalyzerQuestionChoices = {
  yesNo: [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ],
  washFrequency: [
    { label: 'Daily', value: 'daily' },
    { label: 'Every 2-3 days', value: 'every_2_3_days' },
    { label: 'Once a week', value: 'once_a_week' },
    { label: 'Other', value: 'other' },
  ],
  hairLossDuration: [
    { label: 'Less than 1 month', value: 'less_than_1_month' },
    { label: '1-3 months', value: '1_3_months' },
    { label: '3-6 months', value: '3_6_months' },
    { label: 'More than 6 months', value: 'more_than_6_months' },
  ],
  hairLossArea: [
    { label: 'Front hairline', value: 'front_hairline' },
    { label: 'Crown/top', value: 'crown_top' },
    { label: 'Temples', value: 'temples' },
    { label: 'All over', value: 'all_over' },
    { label: 'Unsure', value: 'unsure' },
  ],
  hairCondition: [
    { label: 'Healthy', value: 'healthy' },
    { label: 'Slightly dry', value: 'slightly_dry' },
    { label: 'Damaged', value: 'damaged' },
    { label: 'Very damaged', value: 'very_damaged' },
  ],
  donationLength: [
    { label: 'Below minimum / very short', value: 'below_minimum' },
    { label: 'Shoulder length', value: 'shoulder_length' },
    { label: 'Below shoulder', value: 'below_shoulder' },
    { label: 'Mid-back or longer', value: 'mid_back_or_longer' },
    { label: 'Not sure', value: 'not_sure' },
  ],
};

export const hairAnalysisFunctionName = process.env.EXPO_PUBLIC_HAIR_ANALYSIS_FUNCTION || 'analyze-hair-submission';

export const hairSubmissionStorageBucket = process.env.EXPO_PUBLIC_HAIR_SUBMISSIONS_BUCKET || 'hair-submissions';
