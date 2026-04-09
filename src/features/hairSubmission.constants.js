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
  { key: 'front_view', label: 'Front View Photo' },
  { key: 'back_view', label: 'Back View Photo' },
  { key: 'hair_ends_close_up', label: 'Hair Ends Close-Up' },
  { key: 'side_view', label: 'Side View Photo' },
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
  screeningIntent: [
    { label: 'Initial donation screening', value: 'initial_donation_screening' },
    { label: 'Checking eligibility first', value: 'checking_eligibility_first' },
  ],
  chemicalTreatments: [
    { label: 'Rebonded', value: 'rebonded' },
    { label: 'Permed', value: 'permed' },
    { label: 'Relaxed', value: 'relaxed' },
    { label: 'Keratin-treated', value: 'keratin_treated' },
    { label: 'Hair Botox', value: 'hair_botox' },
    { label: 'Others', value: 'others' },
    { label: 'None', value: 'none' },
  ],
  treatmentTiming: [
    { label: 'Within the past 3 months', value: 'within_3_months' },
    { label: '4 to 6 months ago', value: 'four_to_six_months' },
    { label: '7 to 12 months ago', value: 'seven_to_twelve_months' },
    { label: 'More than 1 year ago', value: 'more_than_1_year' },
  ],
  colorStatus: [
    { label: 'No', value: 'no' },
    { label: 'Colored', value: 'colored' },
    { label: 'Bleached', value: 'bleached' },
    { label: 'Both', value: 'both' },
  ],
  colorTiming: [
    { label: 'Within the past 3 months', value: 'within_3_months' },
    { label: '4 to 6 months ago', value: 'four_to_six_months' },
    { label: '7 to 12 months ago', value: 'seven_to_twelve_months' },
    { label: 'More than 1 year ago', value: 'more_than_1_year' },
  ],
  hairCondition: [
    { label: 'Healthy', value: 'healthy' },
    { label: 'Slightly dry', value: 'slightly_dry' },
    { label: 'Dry', value: 'dry' },
    { label: 'Damaged', value: 'damaged' },
  ],
  washFrequencyWeekly: [
    { label: '1 to 2 times', value: '1_2_times' },
    { label: '3 to 4 times', value: '3_4_times' },
    { label: '5 to 6 times', value: '5_6_times' },
    { label: 'Daily', value: 'daily' },
  ],
  heatStylingFrequency: [
    { label: 'Never', value: 'never' },
    { label: 'Rarely', value: 'rarely' },
    { label: 'Sometimes', value: 'sometimes' },
    { label: 'Often', value: 'often' },
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
