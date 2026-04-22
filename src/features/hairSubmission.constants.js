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
  frontView: 'front_view',
  sideProfile: 'side_profile',
  hairEndsCloseUp: 'hair_ends_close_up',
};

export const hairAnalysisRequiredViews = [
  {
    key: hairSubmissionImageTypes.frontView,
    label: 'Front View Photo',
    helperText: 'Capture the front view clearly with your hair and face visible.',
  },
  {
    key: hairSubmissionImageTypes.sideProfile,
    label: 'Side Profile Photo',
    helperText: 'Capture one clear side profile view of your hair.',
  },
  {
    key: hairSubmissionImageTypes.hairEndsCloseUp,
    label: 'Hair Ends Close-Up',
    helperText: 'Capture the hair ends closely so dryness and split ends can be checked.',
  },
];

export const hairAnalyzerConcernTypes = {
  hairLoss: 'hair_loss',
  donationEligibility: 'donation_eligibility',
};

export const hairAnalyzerQuestionChoices = {
  correctionLengthUnit: [
    { label: 'cm', value: 'cm' },
    { label: 'in', value: 'in' },
  ],
  hairTexture: [
    { label: 'Straight', value: 'Straight' },
    { label: 'Wavy', value: 'Wavy' },
    { label: 'Curly', value: 'Curly' },
    { label: 'Coily', value: 'Coily' },
    { label: 'Mixed', value: 'Mixed' },
  ],
  hairDensity: [
    { label: 'Light', value: 'Light' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Thick', value: 'Thick' },
    { label: 'Dense', value: 'Dense' },
  ],
  questionnaireMode: [
    { label: 'First-time hair check', value: 'first_time' },
    { label: 'Follow-up hair check', value: 'returning_follow_up' },
  ],
  yesNo: [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
  ],
  screeningIntent: [
    { label: 'Initial donation screening', value: 'initial_donation_screening' },
    { label: 'Checking eligibility first', value: 'checking_eligibility_first' },
  ],
  washFrequency: [
    { label: 'Daily', value: 'daily' },
    { label: 'Every 2-3 days', value: 'every_2_3_days' },
    { label: '1-2 times a week', value: '1_2_times_weekly' },
    { label: 'Less often', value: 'less_often' },
  ],
  itchFrequency: [
    { label: 'Never', value: 'never' },
    { label: 'Sometimes', value: 'sometimes' },
    { label: 'Often', value: 'often' },
  ],
  dandruffLevel: [
    { label: 'No', value: 'no' },
    { label: 'A little', value: 'a_little' },
    { label: 'A lot', value: 'a_lot' },
  ],
  quickOiliness: [
    { label: 'No', value: 'no' },
    { label: 'Sometimes', value: 'sometimes' },
    { label: 'Yes', value: 'yes' },
  ],
  drynessLevel: [
    { label: 'No', value: 'no' },
    { label: 'Sometimes', value: 'sometimes' },
    { label: 'Yes', value: 'yes' },
  ],
  hairFallLevel: [
    { label: 'No', value: 'no' },
    { label: 'Not sure', value: 'not_sure' },
    { label: 'Yes', value: 'yes' },
  ],
  chemicalProcessHistory: [
    { label: 'No', value: 'no' },
    { label: 'Yes', value: 'yes' },
  ],
  heatUseFrequency: [
    { label: 'Never', value: 'never' },
    { label: 'Sometimes', value: 'sometimes' },
    { label: 'Often', value: 'often' },
  ],
  recommendationFollowThrough: [
    { label: 'Yes, consistently', value: 'yes_consistently' },
    { label: 'Sometimes', value: 'sometimes' },
    { label: 'Not yet', value: 'not_yet' },
  ],
  hairProgress: [
    { label: 'Better', value: 'better' },
    { label: 'About the same', value: 'same' },
    { label: 'Worse', value: 'worse' },
    { label: 'Not sure', value: 'not_sure' },
  ],
  followUpChanges: [
    { label: 'Less dryness', value: 'less_dryness' },
    { label: 'Less oiliness', value: 'less_oiliness' },
    { label: 'Less hair fall', value: 'less_hair_fall' },
    { label: 'Less dandruff', value: 'less_dandruff' },
    { label: 'Softer hair', value: 'softer_hair' },
    { label: 'No major change', value: 'no_major_change' },
    { label: 'It got worse', value: 'got_worse' },
  ],
  routineChangeFocus: [
    { label: 'Washing routine', value: 'washing_routine' },
    { label: 'Hair products', value: 'hair_products' },
    { label: 'Reduced heat styling', value: 'reduced_heat_styling' },
    { label: 'Stopped chemical treatment', value: 'stopped_chemical_treatment' },
    { label: 'Started scalp care', value: 'started_scalp_care' },
    { label: 'Other', value: 'other' },
  ],
  healthyNow: [
    { label: 'Yes', value: 'yes' },
    { label: 'No', value: 'no' },
    { label: 'Not sure', value: 'not_sure' },
  ],
};

export const hairDonationModeOptions = [
  {
    value: 'shipping',
    label: 'Logistics / shipping',
    description: 'Send the prepared hair package to the donation drop-off address. Shipping fee is shouldered by the donor.',
    delivery_method: 'shipping',
    logistics_type: 'shipping',
    shipment_status: 'Pending shipment',
    pickup_request: false,
  },
  {
    value: 'onsite_delivery',
    label: 'Delivered onsite',
    description: 'Bring the prepared donation onsite if you are near the area and ready for manual review.',
    delivery_method: 'onsite_delivery',
    logistics_type: 'onsite_delivery',
    shipment_status: 'Pending onsite drop-off',
    pickup_request: false,
  },
  {
    value: 'pickup',
    label: 'Pickup request',
    description: 'Request pickup if the current pickup settings allow it and the area is covered.',
    delivery_method: 'pickup',
    logistics_type: 'pickup',
    shipment_status: 'Pickup requested',
    pickup_request: true,
  },
  {
    value: 'haircut_assessment',
    label: 'Haircut assessment',
    description: 'Proceed to haircut assessment first. Final scheduling still depends on review and slot availability.',
    delivery_method: 'haircut_assessment',
    logistics_type: '',
    shipment_status: '',
    pickup_request: false,
  },
];

export const hairAnalysisFunctionName = process.env.EXPO_PUBLIC_HAIR_ANALYSIS_FUNCTION || 'analyze-hair-submission';

export const hairSubmissionStorageBucket = process.env.EXPO_PUBLIC_HAIR_SUBMISSIONS_BUCKET || 'hair-submissions';
