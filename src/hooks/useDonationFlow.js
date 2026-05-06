import { useCallback, useEffect, useState } from 'react';
import {
    buildDonationDetailsModel,
    extractHairDetailsFromRecentAssessment,
    getFlowStateSummary,
    getProfileCompletionStatus,
    getRecentHairEligibilityResult,
    isProfileComplete,
    validateDonationDetails
} from '../features/donationLogisticsFlow.service';
import { logAppError, logAppEvent } from '../utils/appErrors';

/**
 * Hook for managing donation logistics flow state
 *
 * Manages:
 * - Current flow step (profile → hair eligibility → donation details → QR → shipment → certificate)
 * - Profile completion status
 * - Hair eligibility status
 * - Donation details form state
 * - Navigation and progression through flow
 */
export const useDonationFlow = ({
  userProfile = {},
  hairSubmissions = [],
  onFlowComplete = null,
  onFlowError = null,
} = {}) => {
  // Flow state
  const [currentStep, setCurrentStep] = useState(1);
  const [isCheckingHair, setIsCheckingHair] = useState(false);
  const [donationDetails, setDonationDetails] = useState(null);
  const [selectedHairPhoto, setSelectedHairPhoto] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [generatedCertificate, setGeneratedCertificate] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Computed states
  const flowState = getFlowStateSummary({
    currentStep,
    userProfile,
    hairSubmissions,
    donationDetails,
    isCheckingHair,
  });

  const profileStatus = getProfileCompletionStatus(userProfile);
  const recentHairEligibility = getRecentHairEligibilityResult(hairSubmissions);
  const recentHairDetails = recentHairEligibility
    ? extractHairDetailsFromRecentAssessment(recentHairEligibility)
    : null;

  /**
   * Navigate to next step in flow
   */
  const advanceToNextStep = useCallback(async () => {
    try {
      setError(null);

      switch (currentStep) {
        case 1: // Profile completion → Hair eligibility check
          if (!isProfileComplete(userProfile)) {
            setError('Please complete your profile first');
            return false;
          }
          setCurrentStep(2);
          return true;

        case 2: // Hair eligibility check → Donation details
          if (!recentHairEligibility) {
            setError('Please complete hair eligibility assessment first');
            return false;
          }
          setCurrentStep(3);
          return true;

        case 3: // Donation details → QR code & shipment
          if (!donationDetails || !donationDetails.photoPath) {
            setError('Please provide donation details and upload photo');
            return false;
          }
          setCurrentStep(4);
          return true;

        default:
          return false;
      }
    } catch (err) {
      const errorMsg = err?.message || 'Error advancing flow';
      setError(errorMsg);
      onFlowError?.(errorMsg);
      logAppError('useDonationFlow', err);
      return false;
    }
  }, [currentStep, userProfile, recentHairEligibility, donationDetails, onFlowError]);

  /**
   * Go back to previous step
   */
  const goToPreviousStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  }, [currentStep]);

  /**
   * Restart the entire flow
   */
  const restartFlow = useCallback(() => {
    setCurrentStep(1);
    setIsCheckingHair(false);
    setDonationDetails(null);
    setSelectedHairPhoto(null);
    setQrCode(null);
    setGeneratedCertificate(null);
    setError(null);
  }, []);

  /**
   * Start hair eligibility assessment
   */
  const startHairEligibilityCheck = useCallback(() => {
    setIsCheckingHair(true);
    setError(null);
    logAppEvent('donation_flow', 'Started hair eligibility check');
  }, []);

  /**
   * Complete hair eligibility assessment
   */
  const completeHairEligibilityCheck = useCallback(() => {
    setIsCheckingHair(false);
    logAppEvent('donation_flow', 'Completed hair eligibility check');
    // Automatically advance if check was successful
    return advanceToNextStep();
  }, [advanceToNextStep]);

  /**
   * Update donation details from form or pre-filled data
   */
  const updateDonationDetails = useCallback(
    (details = {}) => {
      try {
        const updatedDetails = buildDonationDetailsModel({
          hairLength: details.hairLength,
          hairLengthUnit: details.hairLengthUnit,
          bundleQuantity: details.bundleQuantity,
          uploadedPhotoPath: details.uploadedPhotoPath,
          photoFileName: details.photoFileName,
          sourceType: details.sourceType || 'independent_donation',
          fromRecentAssessment: Boolean(details.fromRecentAssessment),
          recentAssessmentData: details.recentAssessmentData,
        });

        setDonationDetails(updatedDetails);
        setError(null);
        return true;
      } catch (err) {
        const errorMsg = 'Failed to update donation details';
        setError(errorMsg);
        logAppError('useDonationFlow', err);
        return false;
      }
    },
    []
  );

  /**
   * Validate current donation details
   */
  const validateCurrentDonationDetails = useCallback(
    (donationRequirement = null) => {
      if (!donationDetails) {
        return {
          isValid: false,
          errors: ['No donation details provided'],
        };
      }

      return validateDonationDetails(donationDetails, donationRequirement);
    },
    [donationDetails]
  );

  /**
   * Pre-fill donation form from recent hair assessment
   */
  const prefillFromRecentAssessment = useCallback(() => {
    if (!recentHairDetails) {
      setError('No recent hair assessment available');
      return false;
    }

    try {
      updateDonationDetails({
        hairLength: recentHairDetails.estimatedLengthInches,
        hairLengthUnit: 'in',
        bundleQuantity: 1,
        fromRecentAssessment: true,
        recentAssessmentData: recentHairDetails,
      });

      logAppEvent('donation_flow', 'Pre-filled from recent assessment');
      return true;
    } catch (err) {
      setError('Failed to pre-fill from recent assessment');
      logAppError('useDonationFlow', err);
      return false;
    }
  }, [recentHairDetails, updateDonationDetails]);

  /**
   * Set selected hair photo for upload
   */
  const setHairPhoto = useCallback((photoPath, fileName = null) => {
    setSelectedHairPhoto({
      path: photoPath,
      fileName: fileName || `hair_photo_${Date.now()}`,
    });
  }, []);

  /**
   * Set generated QR code
   */
  const setGeneratedQrCode = useCallback((qrData) => {
    setQrCode(qrData);
    logAppEvent('donation_flow', 'QR code generated');
  }, []);

  /**
   * Set generated certificate
   */
  const setDonationCertificate = useCallback((certificateData) => {
    setGeneratedCertificate(certificateData);
    logAppEvent('donation_flow', 'Certificate generated');
    onFlowComplete?.('certificate_generated', certificateData);
  }, [onFlowComplete]);

  /**
   * Get actionable prompt for current step
   */
  const getCurrentStepPrompt = useCallback(() => {
    const step = flowState.flowStep;

    switch (step.name) {
      case 'profile_incomplete':
        return {
          icon: 'person',
          title: step.title,
          message: step.description,
          action: step.action,
          primaryButtonText: 'Complete Profile',
        };

      case 'hair_eligibility_pending':
        return {
          icon: 'checkmark-circle',
          title: step.title,
          message: step.description,
          action: step.action,
          primaryButtonText: 'Check Hair Eligibility',
          secondaryButtonText: 'Maybe Later',
        };

      case 'hair_eligibility_in_progress':
        return {
          icon: 'time',
          title: 'Assessing Hair',
          message: 'Taking photos and analyzing your hair eligibility...',
          action: 'continue_hair_check',
          isLoading: true,
        };

      case 'ready_for_donation':
        return {
          icon: 'gift',
          title: step.title,
          message: step.description,
          action: step.action,
          primaryButtonText: 'Enter Donation Details',
          canPrefillHair: Boolean(recentHairDetails),
          prefillButtonText: recentHairDetails
            ? `Use Hair from ${new Date(recentHairDetails.assessmentDate).toLocaleDateString()}`
            : null,
        };

      default:
        return null;
    }
  }, [flowState, recentHairDetails]);

  /**
   * Check flow completion
   */
  useEffect(() => {
    if (
      currentStep >= 4
      && generatedCertificate
      && flowState.donationDetailsReady
    ) {
      onFlowComplete?.('donation_complete', {
        donationDetails,
        qrCode,
        certificate: generatedCertificate,
      });
    }
  }, [currentStep, generatedCertificate, flowState, donationDetails, qrCode, onFlowComplete]);

  return {
    // State
    currentStep,
    flowState,
    profileStatus,
    recentHairEligibility,
    recentHairDetails,
    donationDetails,
    selectedHairPhoto,
    qrCode,
    generatedCertificate,
    error,
    isLoading,
    isCheckingHair,

    // Actions
    advanceToNextStep,
    goToPreviousStep,
    restartFlow,
    startHairEligibilityCheck,
    completeHairEligibilityCheck,
    updateDonationDetails,
    validateCurrentDonationDetails,
    prefillFromRecentAssessment,
    setHairPhoto,
    setGeneratedQrCode,
    setDonationCertificate,
    getCurrentStepPrompt,
    setError,
    setIsLoading,
  };
};
