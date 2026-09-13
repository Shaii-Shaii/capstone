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
    key: hairSubmissionImageTypes.frontView,
    label: 'Front Hair / Face View',
    helperText: 'Face the camera directly and make sure your face, hairline, and front section of your hair are clearly visible.',
    displayTip: 'Keep your face, hairline, and front hair inside the guide.',
    tutorialTitle: 'Front hair / face view',
    tutorialTips: [
      'Purpose: shows the front hairline, Hair Pattern, color, apparent density, and session continuity.',
      'Hair: visible and unobstructed; avoid hats or accessories that hide the hairline.',
      'Camera: face it directly and keep your face and hair inside the guide.',
      'Light: use bright, even lighting with no beauty filters.',
    ],
  },
  {
    key: hairSubmissionImageTypes.sideProfile,
    label: 'Left Side Hair View',
    helperText: 'Turn to your left and keep the side of your face and hair clearly visible.',
    displayTip: 'Turn left and keep your profile, hairline, length, and ends in frame.',
    tutorialTitle: 'Left side hair view',
    tutorialTips: [
      'Purpose: shows left-side appearance, Hair Pattern, length, condition, and continuity with the Front view.',
      'Hair: loose and resting naturally; a partly covered profile is acceptable when the hair remains clear.',
      'Camera: turn to your left and keep the side of your face and hair visible.',
      'Light: avoid shadows, glare, and beauty filters.',
    ],
  },
  {
    key: hairSubmissionImageTypes.rightSideProfile,
    label: 'Right Side Hair View',
    helperText: 'Turn to your right and keep the side of your face and hair clearly visible.',
    displayTip: 'Turn right and keep your profile, hairline, length, and ends in frame.',
    tutorialTitle: 'Right side hair view',
    tutorialTips: [
      'Purpose: shows right-side appearance, Hair Pattern, length, condition, and continuity with the Front view.',
      'Hair: loose and resting naturally; a partly covered profile is acceptable when the hair remains clear.',
      'Camera: turn to your right and keep the side of your face and hair visible.',
      'Light: avoid shadows, glare, and beauty filters.',
    ],
  },
  {
    key: hairSubmissionImageTypes.backHair,
    label: 'Back Hair View',
    helperText: 'Position the camera behind you and make sure the full visible length of your hair is inside the frame.',
    displayTip: 'Face away, center all of your loose hair, and include the ends.',
    tutorialTitle: 'Back hair view',
    tutorialTips: [
      'Purpose: shows overall length, Hair Pattern, apparent density, color, and visible condition.',
      'Hair: loose, centered, and fully visible from roots to ends.',
      'Camera: behind you at hair level; ask someone to help if needed.',
      'Light: use bright, even light and no filters.',
    ],
  },
  {
    key: hairSubmissionImageTypes.hairScalp,
    label: 'Scalp / Root View',
    helperText: 'Part or gently lift your hair so a small section of your scalp and roots are clearly visible.',
    displayTip: 'Part the hair gently and keep the roots sharp and well lit.',
    tutorialTitle: 'Scalp / root view',
    tutorialTips: [
      'Purpose: shows visible root coverage, oiliness, and visible scalp flaking.',
      'Hair: make one gentle part; do not scratch the scalp or apply products first.',
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
