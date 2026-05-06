import { buildProfileCompletionMeta } from './profile/services/profile.service';

/**
 * Donation Logistics Flow Service
 * 
 * Implements the complete donation logistics flow:
 * 1. Profile completion check
 * 2. Hair eligibility assessment check (within 30 days)
 * 3. Hair details collection (auto-fill from recent log or manual entry)
 * 4. QR code generation
 * 5. Shipment notification and tracking
 * 6. Staff QR code validation
 * 7. Certificate generation
 */

const HAIR_ELIGIBILITY_VALIDITY_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Check if user profile is complete
 */
export const isProfileComplete = (userProfile = {}) => {
  const completionMeta = buildProfileCompletionMeta(userProfile);
  return completionMeta.percentage === 100;
};

/**
 * Get profile completion status with details
 */
export const getProfileCompletionStatus = (userProfile = {}) => {
  const completionMeta = buildProfileCompletionMeta(userProfile);
  return {
    isComplete: completionMeta.percentage === 100,
    percentage: completionMeta.percentage,
    completedFields: completionMeta.completedFieldCount,
    totalFields: completionMeta.totalFieldCount,
    missingFieldLabels: completionMeta.missingFieldLabels,
    sections: completionMeta.sections,
  };
};

/**
 * Check if hair eligibility assessment is recent (within last 30 days)
 */
export const isHairEligibilityRecentByDate = (screeningDate = null) => {
  if (!screeningDate) return false;

  try {
    const screeningTime = new Date(screeningDate).getTime();
    const now = Date.now();
    const ageMs = now - screeningTime;
    const ageDays = ageMs / ONE_DAY_MS;

    return ageDays <= HAIR_ELIGIBILITY_VALIDITY_DAYS;
  } catch {
    return false;
  }
};

/**
 * Get the most recent hair analysis result (if within 30 days)
 */
export const getRecentHairEligibilityResult = (submissions = []) => {
  if (!Array.isArray(submissions) || submissions.length === 0) {
    return null;
  }

  // Sort submissions by creation date (newest first)
  const sortedSubmissions = [...submissions].sort((a, b) => {
    const dateA = new Date(a?.created_at || 0).getTime();
    const dateB = new Date(b?.created_at || 0).getTime();
    return dateB - dateA;
  });

  // Find the most recent submission with AI screening
  for (const submission of sortedSubmissions) {
    const screenings = submission?.ai_screenings || [];
    if (screenings.length > 0) {
      const mostRecentScreening = screenings[0]; // Assuming screenings are already sorted
      const isRecent = isHairEligibilityRecentByDate(mostRecentScreening?.created_at);

      if (isRecent) {
        const latestDetail = [...(submission?.submission_details || [])]
          .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())[0];

        return {
          submission,
          screening: mostRecentScreening,
          detail: latestDetail,
          isRecent: true,
          createdAt: mostRecentScreening?.created_at,
          decision: mostRecentScreening?.decision,
          estimatedLength: mostRecentScreening?.estimated_length,
        };
      }
    }
  }

  return null;
};

/**
 * Extract hair details from most recent assessment
 * Used to auto-fill donation form when recent assessment exists
 */
export const extractHairDetailsFromRecentAssessment = (recentResult = null) => {
  if (!recentResult) return null;

  const { screening, detail } = recentResult;

  return {
    // From AI screening
    estimatedLengthCm: screening?.estimated_length,
    estimatedLengthInches: screening?.estimated_length ? (screening.estimated_length / 2.54).toFixed(1) : null,
    detectedColor: screening?.detected_color,
    detectedTexture: screening?.detected_texture,
    detectedDensity: screening?.detected_density,
    detectedCondition: screening?.detected_condition,
    confidenceScore: screening?.confidence_score,
    shinLevel: screening?.shine_level,
    frizzLevel: screening?.frizz_level,
    drynessLevel: screening?.dryness_level,
    oilinessLevel: screening?.oiliness_level,
    damageLevel: screening?.damage_level,

    // From submission detail
    declaredLength: detail?.declared_length,
    declaredColor: detail?.declared_color,
    declaredTexture: detail?.declared_texture,
    declaredDensity: detail?.declared_density,
    declaredCondition: detail?.declared_condition,
    isChemicallyTreated: detail?.is_chemically_treated,
    isColored: detail?.is_colored,
    isBeached: detail?.is_bleached,
    isRebonded: detail?.is_rebonded,

    // Assessment metadata
    assessmentDate: recentResult.createdAt,
    submissionId: recentResult.submission?.submission_id,
  };
};

/**
 * Determine current step in donation flow based on user state
 */
export const determineDonationFlowStep = ({
  userProfile = {},
  hairSubmissions = [],
  isCheckingHair = false,
} = {}) => {
  // Step 1: Profile completion check
  if (!isProfileComplete(userProfile)) {
    return {
      step: 1,
      name: 'profile_incomplete',
      title: 'Finish Setting Up Your Account',
      description: 'Complete your profile before requesting a donation.',
      action: 'manage_profile',
      requiresProfileCompletion: true,
    };
  }

  // Step 2: Hair eligibility assessment check
  const recentEligibility = getRecentHairEligibilityResult(hairSubmissions);
  const hasRecentEligibility = recentEligibility && recentEligibility.isRecent;

  if (!hasRecentEligibility && !isCheckingHair) {
    return {
      step: 2,
      name: 'hair_eligibility_pending',
      title: 'Hair Eligibility Assessment Required',
      description: 'Your hair eligibility assessment has expired or not yet completed. Please assess your hair.',
      action: 'check_hair',
      requiresHairAssessment: true,
    };
  }

  if (isCheckingHair) {
    return {
      step: 2,
      name: 'hair_eligibility_in_progress',
      title: 'Assessing Hair Eligibility',
      description: 'Please complete the hair eligibility assessment.',
      action: 'continue_hair_check',
      requiresHairAssessment: true,
      isInProgress: true,
    };
  }

  // Step 3: Proceed to donation details
  return {
    step: 3,
    name: 'ready_for_donation',
    title: 'Request to Donate',
    description: 'Your profile is complete and hair is eligible. Proceed with donation.',
    action: 'enter_donation_details',
    recentHairDetails: recentEligibility ? extractHairDetailsFromRecentAssessment(recentEligibility) : null,
    hairEligibilityResult: recentEligibility,
  };
};

/**
 * Check if user wants to re-assess hair eligibility
 * (even though they have a recent assessment)
 */
export const buildHairEligibilityRecheckPrompt = (recentResult = null) => {
  if (!recentResult) return null;

  return {
    title: 'Hair Eligibility Status',
    message: `Your hair was assessed on ${new Date(recentResult.createdAt).toLocaleDateString()}. Result: ${recentResult.decision}`,
    actionTitle: 'Re-assess Hair?',
    allowRecheck: true,
    currentResult: recentResult,
  };
};

/**
 * Build donation details model from form input or auto-filled data
 */
export const buildDonationDetailsModel = ({
  hairLength = null,
  hairLengthUnit = 'in',
  bundleQuantity = '1',
  uploadedPhotoPath = null,
  photoFileName = null,
  sourceType = 'independent_donation', // 'independent_donation', 'drive_donation', 'manual_entry'
  fromRecentAssessment = false,
  recentAssessmentData = null,
} = {}) => {
  const normalized = {
    hairLengthValue: Number(hairLength) || 0,
    hairLengthUnit: hairLengthUnit === 'cm' ? 'cm' : 'in',
    bundleQuantity: Math.max(1, Number(bundleQuantity) || 1),
    photoPath: uploadedPhotoPath,
    photoFileName,
    sourceType,
    fromRecentAssessment: Boolean(fromRecentAssessment),
    recentAssessmentMetadata: fromRecentAssessment ? recentAssessmentData : null,
    createdAt: new Date().toISOString(),
  };

  return normalized;
};

/**
 * Determine if donation details are valid
 */
export const validateDonationDetails = (donationDetails = {}, donationRequirement = null) => {
  const errors = [];
  const warnings = [];

  if (!donationDetails.hairLengthValue || donationDetails.hairLengthValue <= 0) {
    errors.push('Hair length is required and must be greater than 0');
  }

  if (!donationDetails.bundleQuantity || donationDetails.bundleQuantity <= 0) {
    errors.push('Bundle quantity is required and must be at least 1');
  }

  if (!donationDetails.photoPath) {
    errors.push('Donation photo is required');
  }

  // Check against donation requirements if provided
  if (donationRequirement) {
    const minLength = donationRequirement.minimum_hair_length || 14;
    const minLengthInches = donationRequirement.minimum_hair_length
      ? (donationRequirement.minimum_hair_length / 2.54).toFixed(1)
      : 14;

    const hairLengthInches = donationDetails.hairLengthUnit === 'cm'
      ? (donationDetails.hairLengthValue / 2.54).toFixed(1)
      : donationDetails.hairLengthValue;

    if (hairLengthInches < minLengthInches) {
      errors.push(`Hair must be at least ${minLengthInches} inches (${minLength} cm)`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
};

/**
 * Build QR code payload for donation tracking
 */
export const buildDonationQrPayload = ({
  submissionCode = '',
  donorId = '',
  donationDetails = {},
  timestamp = null,
} = {}) => {
  return {
    submissionCode,
    donorId,
    donationTimestamp: timestamp || new Date().toISOString(),
    hairLength: donationDetails.hairLengthValue,
    hairLengthUnit: donationDetails.hairLengthUnit,
    bundleQuantity: donationDetails.bundleQuantity,
    sourceType: donationDetails.sourceType,
    fromRecentAssessment: donationDetails.fromRecentAssessment,
  };
};

/**
 * Build notification payload for staff when donation is submitted
 */
export const buildDonationSubmittedNotification = ({
  donorId = '',
  donorName = '',
  submissionCode = '',
  donationDetails = {},
  qrCodeUrl = '',
} = {}) => {
  return {
    type: 'donation_submitted',
    title: 'New Donation Received',
    message: `Donation from ${donorName} (${submissionCode}) - ${donationDetails.bundleQuantity} bundle(s)`,
    metadata: {
      donorId,
      submissionCode,
      qrCodeUrl,
      hairLength: donationDetails.hairLengthValue,
      bundleQuantity: donationDetails.bundleQuantity,
      sourceType: donationDetails.sourceType,
    },
  };
};

/**
 * Validate QR code scanned by staff
 */
export const validateQrCodeScan = ({
  qrPayload = {},
  existingSubmission = null,
  donationStatus = 'received',
} = {}) => {
  const errors = [];

  if (!qrPayload?.submissionCode) {
    errors.push('Invalid QR code: Missing submission code');
    return { isValid: false, errors };
  }

  if (existingSubmission?.status && existingSubmission.status !== 'pending') {
    errors.push(`This donation has already been processed as: ${existingSubmission.status}`);
    return { isValid: false, errors };
  }

  return {
    isValid: errors.length === 0,
    errors,
    validationTimestamp: new Date().toISOString(),
  };
};

/**
 * Build certificate generation payload after successful donation
 */
export const buildDonationCertificatePayload = ({
  donorId = '',
  donorName = '',
  donationDate = '',
  bundleQuantity = 0,
  hairLength = 0,
  hairLengthUnit = 'in',
  certificateId = '',
} = {}) => {
  return {
    donorId,
    donorName,
    donationDate: donationDate || new Date().toISOString(),
    bundleQuantity,
    hairLength,
    hairLengthUnit,
    certificateId: certificateId || `CERT-${Date.now().toString(36).toUpperCase()}`,
    generatedAt: new Date().toISOString(),
  };
};

/**
 * Get flow state summary for UI
 */
export const getFlowStateSummary = ({
  currentStep = 1,
  userProfile = {},
  hairSubmissions = [],
  donationDetails = null,
  isCheckingHair = false,
} = {}) => {
  const profileStatus = getProfileCompletionStatus(userProfile);
  const recentEligibility = getRecentHairEligibilityResult(hairSubmissions);
  const flowStep = determineDonationFlowStep({
    userProfile,
    hairSubmissions,
    isCheckingHair,
  });

  return {
    currentStep: flowStep.step,
    flowStepName: flowStep.name,
    profileComplete: profileStatus.isComplete,
    hairEligible: recentEligibility && recentEligibility.isRecent,
    recentHairDetails: recentEligibility ? extractHairDetailsFromRecentAssessment(recentEligibility) : null,
    donationDetailsReady: Boolean(donationDetails && donationDetails.hairLengthValue && donationDetails.photoPath),
    flowStep,
    profileStatus,
  };
};
