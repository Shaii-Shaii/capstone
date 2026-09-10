export const hairSubmissionStatuses = {
  submission: {
    submitted: 'Pending',
  },
  detail: {
    pending: 'Pending',
  },
};

export const hairSubmissionImageTypes = {
  donorUpload: 'donor_upload',
  frontView: 'front_view',
  sideProfile: 'side_profile',
  rightSideProfile: 'right_side_profile',
  hairScalp: 'hair_scalp',
  hairEndsCloseUp: 'hair_ends_close_up',
  backHair: 'back_hair',
};

export const hairAnalysisRequiredViews = [
  {
    key: hairSubmissionImageTypes.backHair,
    label: 'Back Hair',
    helperText: 'Show your loose hair from the back, from the roots down to the lowest visible ends. Your face does not need to be visible.',
    displayTip: 'Face away, center all of your loose hair, and include the ends.',
    tutorialTitle: 'Back hair',
    tutorialTips: [
      'Purpose: shows overall length, color, texture, and condition.',
      'Hair: loose, centered, and fully visible from roots to ends.',
      'Camera: behind you at hair level; ask someone to help if needed.',
      'Light: use bright, even light and no filters.',
    ],
  },
  {
    key: hairSubmissionImageTypes.sideProfile,
    label: 'Left Back/Side Hair',
    helperText: 'Turn slightly right to show the left back/side of your loose hair. Keep part of your profile visible so the app can verify your direction.',
    displayTip: 'Turn slightly right so the left back/side and ends stay in frame.',
    tutorialTitle: 'Left back/side hair',
    tutorialTips: [
      'Purpose: shows left-side length, texture, and visible concerns.',
      'Hair: loose and resting naturally; keep part of your profile visible for direction checking.',
      'Camera: behind and slightly to your left at hair level.',
      'Light: avoid shadows, glare, and beauty filters.',
    ],
  },
  {
    key: hairSubmissionImageTypes.rightSideProfile,
    label: 'Right Back/Side Hair',
    helperText: 'Turn slightly left to show the right back/side of your loose hair. Keep part of your profile visible so the app can verify your direction.',
    displayTip: 'Turn slightly left so the right back/side and ends stay in frame.',
    tutorialTitle: 'Right back/side hair',
    tutorialTips: [
      'Purpose: shows right-side length, texture, and visible concerns.',
      'Hair: loose and resting naturally; keep part of your profile visible for direction checking.',
      'Camera: behind and slightly to your right at hair level.',
      'Light: avoid shadows, glare, and beauty filters.',
    ],
  },
  {
    key: hairSubmissionImageTypes.hairScalp,
    label: 'Scalp / Root Area',
    helperText: 'Show the crown and root area clearly with a gentle part. This is a visible screening only, not a medical examination.',
    displayTip: 'Part the hair gently and keep the roots sharp and well lit.',
    tutorialTitle: 'Scalp / root area',
    tutorialTips: [
      'Purpose: shows visible root coverage, oiliness, and flaking.',
      'Hair: make one gentle part; do not apply products first.',
      'Camera: above the crown, close enough to keep roots sharp.',
      'Light: bright and even, with no flash glare or filters.',
    ],
  },
];

export const hairAnalyzerConcernTypes = {
  hairLoss: 'hair_loss',
  donationEligibility: 'donation_eligibility',
};

export const hairAnalyzerQuestionChoices = {
  correctionLengthUnit: [
    { label: 'Inches', value: 'in' },
  ],
  hairTexture: [
    { label: 'Straight', value: 'Straight' },
    { label: 'Wavy', value: 'Wavy' },
    { label: 'Curly', value: 'Curly' },
    { label: 'Coily', value: 'Coily' },
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
    { label: 'No visible flaking', value: 'no' },
    { label: 'A little visible flaking', value: 'a_little' },
    { label: 'A lot of visible flaking', value: 'a_lot' },
  ],
  quickOiliness: [
    { label: 'No', value: 'no' },
    { label: 'Sometimes', value: 'sometimes' },
    { label: 'Yes', value: 'yes' },
  ],
  drynessLevel: [
    { label: 'Balanced appearance', value: 'normal_balanced' },
    { label: 'Dry appearance', value: 'dry' },
    { label: 'Rough appearance', value: 'rough' },
    { label: 'Oily appearance', value: 'oily' },
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
    { label: 'Less visible flaking', value: 'less_dandruff' },
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
    { label: 'Fewer visible concerns', value: 'yes' },
    { label: 'Visible concerns remain', value: 'no' },
    { label: 'Not sure', value: 'not_sure' },
  ],
};

export const hairDonationModeOptions = [
  {
    value: 'shipping',
    label: 'Ship by Courier',
    description: 'Pack your donation and send it using your preferred courier.',
    delivery_method: 'shipping',
    logistics_type: 'Ship by Courier',
    shipment_status: 'Pending shipment',
  },
  {
    value: 'onsite_delivery',
    label: 'Walk-in Drop-off',
    description: 'Schedule a visit and personally bring your donation.',
    delivery_method: 'onsite_delivery',
    logistics_type: 'Walk-in Drop-off',
    shipment_status: 'Pending onsite drop-off',
  },
  {
    value: 'haircut_assessment',
    label: 'Haircut assessment',
    description: 'Proceed to haircut assessment first. Final scheduling still depends on review and slot availability.',
    delivery_method: 'haircut_assessment',
    logistics_type: '',
    shipment_status: '',
  },
];

export const hairAnalysisFunctionName = process.env.EXPO_PUBLIC_HAIR_ANALYSIS_FUNCTION || 'analyze-hair-submission';

export const hairSubmissionStorageBucket = process.env.EXPO_PUBLIC_HAIR_SUBMISSIONS_BUCKET || 'hair-submissions';
