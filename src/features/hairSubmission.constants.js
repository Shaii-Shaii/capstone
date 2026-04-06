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

export const donorHairEligibilityRules = {
  minimumLengthInches: 14,
  minimumLengthCentimeters: 35.6,
  requireNaturalColor: false,
  requireHairTied: true,
  rejectCapDetected: true,
  rejectAccessoryObstruction: true,
  rejectVisibleDandruffConcern: true,
  rejectVisibleLiceConcern: true,
};

export const hairAnalysisFunctionName = process.env.EXPO_PUBLIC_HAIR_ANALYSIS_FUNCTION || 'analyze-hair-submission';

export const hairSubmissionStorageBucket = process.env.EXPO_PUBLIC_HAIR_SUBMISSIONS_BUCKET || 'hair-submissions';
