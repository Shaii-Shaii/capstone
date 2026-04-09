import { useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { analyzeHairPhotos } from '../features/hairAnalysis.service';
import { getHairDonationModuleContext, saveHairSubmissionFlow } from '../features/hairSubmission.service';
import { hairAnalysisRequiredViews } from '../features/hairSubmission.constants';
import { logAppEvent } from '../utils/appErrors';

const MAX_PHOTO_COUNT = hairAnalysisRequiredViews.length;
const IMAGE_MEDIA_TYPES = ['images'];

const createErrorState = (title, message) => ({
  title,
  message,
});

const createEmptyPhotoSlots = () => Array.from({ length: MAX_PHOTO_COUNT }, () => null);

const mapImagePickerError = (message = '') => {
  const normalized = message.toLowerCase();

  if (normalized.includes('photo library access')) {
    return createErrorState('Photo Access Needed', 'Allow photo library access first so you can upload hair images.');
  }

  if (normalized.includes('camera access')) {
    return createErrorState('Camera Access Needed', 'Allow camera access first so you can take guided hair photos.');
  }

  if (normalized.includes('read the selected hair images')) {
    return createErrorState('Photos Could Not Be Read', 'Please choose a clear image file again. The selected photo could not be processed.');
  }

  return createErrorState('Unable To Use Photo', 'We could not open that photo right now. Please try again.');
};

const mapAnalysisError = (message = '') => {
  const normalized = message.toLowerCase();

  if (normalized.includes('at least one hair photo')) {
    return createErrorState('Upload Photos First', 'Add the required hair photos before running the analysis.');
  }

  if (normalized.includes('guided donation questions')) {
    return createErrorState('Questions Needed', 'Complete the screening questions first before analysis.');
  }

  if (normalized.includes('compliance checklist')) {
    return createErrorState('Checklist Needed', 'Confirm the photo checklist first before analysis.');
  }

  if (normalized.includes('response was incomplete')) {
    return createErrorState('Analysis Was Incomplete', 'The scan did not finish properly. Please try analyzing the photos again.');
  }

  if (normalized.includes('session has expired') || normalized.includes('sign in again')) {
    return createErrorState('Session Expired', 'Please sign in again to continue the hair analysis.');
  }

  if (normalized.includes('could not be read')) {
    return createErrorState('Photo Could Not Be Read', 'One of the uploaded photos could not be processed. Please upload or retake that hair view again.');
  }

  if (normalized.includes('front view photo') || normalized.includes('back view photo') || normalized.includes('hair ends close-up') || normalized.includes('side view photo')) {
    return createErrorState('More Hair Views Needed', message);
  }

  if (normalized.includes('not clear enough for a reliable hair analysis')) {
    return createErrorState('Photos Need Better Clarity', 'The uploaded hair photos were too unclear for a reliable result. Please retake them in brighter light and keep the hair centered.');
  }

  return createErrorState('Analysis Unavailable', 'We could not analyze the uploaded hair photos right now. Please try again in a moment.');
};

const mapSaveError = (message = '') => {
  const normalized = message.toLowerCase();

  if (normalized.includes('session is not ready')) {
    return createErrorState('Session Not Ready', 'Please reopen the donation screen and try again.');
  }

  if (normalized.includes('upload at least one photo')) {
    return createErrorState('Photos Are Required', 'Upload the required hair photos first before saving the donation.');
  }

  if (normalized.includes('run the ai analysis')) {
    return createErrorState('Analysis Needed', 'Wait for the AI result or run the analysis again before saving.');
  }

  return createErrorState('Unable To Save Donation', 'Your donation details were not saved yet. Please review the form and try again.');
};

const buildPhotoRecord = (asset, slotIndex) => {
  if (!asset?.uri || !asset?.base64) return null;

  const view = hairAnalysisRequiredViews[slotIndex];
  return {
    id: asset.assetId || `${asset.uri}-${view?.key || slotIndex}`,
    uri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
    width: asset.width,
    height: asset.height,
    dataUrl: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
    viewKey: view?.key || `view_${slotIndex + 1}`,
    viewLabel: view?.label || `View ${slotIndex + 1}`,
  };
};

export const useDonorHairSubmission = ({ userId }) => {
  const [photos, setPhotos] = useState(createEmptyPhotoSlots);
  const [analysis, setAnalysis] = useState(null);
  const [analyzerContext, setAnalyzerContext] = useState({
    donationRequirement: null,
    logisticsSettings: null,
    upcomingHaircutSchedules: [],
    latestHaircutReservation: null,
    latestCertificate: null,
    latestSubmission: null,
    latestSubmissionDetail: null,
  });
  const [isPickingImages, setIsPickingImages] = useState(false);
  const [isCapturingImages, setIsCapturingImages] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const completedPhotoCount = useMemo(
    () => photos.filter(Boolean).length,
    [photos]
  );
  const hasCompletePhotoSet = completedPhotoCount === MAX_PHOTO_COUNT;
  const canAnalyze = hasCompletePhotoSet && !isAnalyzing;

  const progressLabel = useMemo(() => {
    if (isSaving) return 'Saving your submission';
    if (isAnalyzing) return 'Running AI analysis';
    if (analysis) return 'Review AI result';
    if (hasCompletePhotoSet) return 'Ready for AI analysis';
    if (completedPhotoCount) return `${MAX_PHOTO_COUNT - completedPhotoCount} more view${MAX_PHOTO_COUNT - completedPhotoCount === 1 ? '' : 's'} needed`;
    return 'Begin photo capture';
  }, [analysis, completedPhotoCount, hasCompletePhotoSet, isAnalyzing, isSaving]);

  useEffect(() => {
    if (!userId) return;

    const loadContext = async () => {
      setIsLoadingContext(true);
      const result = await getHairDonationModuleContext(userId);
      setIsLoadingContext(false);

      setAnalyzerContext({
        donationRequirement: result.donationRequirement,
        logisticsSettings: result.logisticsSettings,
        upcomingHaircutSchedules: result.upcomingHaircutSchedules || [],
        latestHaircutReservation: result.latestHaircutReservation,
        latestCertificate: result.latestCertificate,
        latestSubmission: result.latestSubmission,
        latestSubmissionDetail: result.latestSubmissionDetail,
      });

      logAppEvent('donor_hair_submission.context', 'Hair analyzer context loaded.', {
        userId,
        hasDonationRequirement: Boolean(result.donationRequirement?.donation_requirement_id),
        pickupEnabled: result.logisticsSettings?.is_pickup_enabled ?? null,
        haircutScheduleCount: Array.isArray(result.upcomingHaircutSchedules) ? result.upcomingHaircutSchedules.length : 0,
        latestSubmissionId: result.latestSubmission?.submission_id || null,
        latestSubmissionDetailId: result.latestSubmissionDetail?.submission_detail_id || null,
        hasError: Boolean(result.error),
      });
    };

    loadContext();
  }, [userId]);

  const setPhotoAtSlot = (slotIndex, photo) => {
    setPhotos((current) => {
      const next = [...current];
      next[slotIndex] = photo;
      return next;
    });
    setAnalysis(null);
    setError(null);
    setSuccessMessage('');
  };

  const pickPhotoForSlot = async (slotIndex) => {
    try {
      setError(null);
      setSuccessMessage('');
      setIsPickingImages(true);

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Please allow photo library access to upload hair images.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: IMAGE_MEDIA_TYPES,
        quality: 1,
        base64: true,
        selectionLimit: 1,
      });

      setIsPickingImages(false);
      if (result.canceled) {
        return { success: false, canceled: true };
      }

      const selectedPhoto = buildPhotoRecord(result.assets?.[0], slotIndex);
      if (!selectedPhoto) {
        throw new Error('Unable to read the selected hair images.');
      }

      setPhotoAtSlot(slotIndex, selectedPhoto);
      logAppEvent('donor_hair_submission.photo_slot', 'Hair photo uploaded for slot.', {
        userId,
        slotIndex,
        viewKey: selectedPhoto.viewKey,
      });

      return { success: true, photo: selectedPhoto };
    } catch (pickedError) {
      setIsPickingImages(false);
      const mappedError = mapImagePickerError(pickedError.message);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }
  };

  const capturePhotoForSlot = async (slotIndex) => {
    try {
      setError(null);
      setSuccessMessage('');
      setIsCapturingImages(true);

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Please allow camera access to take guided hair photos.');
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: IMAGE_MEDIA_TYPES,
        quality: 1,
        base64: true,
        cameraType: ImagePicker.CameraType.back,
      });

      setIsCapturingImages(false);
      if (result.canceled) {
        return { success: false, canceled: true };
      }

      const capturedPhoto = buildPhotoRecord(result.assets?.[0], slotIndex);
      if (!capturedPhoto) {
        throw new Error('Unable to read the selected hair images.');
      }

      setPhotoAtSlot(slotIndex, capturedPhoto);
      logAppEvent('donor_hair_submission.photo_slot', 'Hair photo captured for slot.', {
        userId,
        slotIndex,
        viewKey: capturedPhoto.viewKey,
      });

      return { success: true, photo: capturedPhoto };
    } catch (captureError) {
      setIsCapturingImages(false);
      const mappedError = mapImagePickerError(captureError.message);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }
  };

  const removePhoto = (slotIndex) => {
    setPhotos((current) => {
      const next = [...current];
      next[slotIndex] = null;
      return next;
    });
    setAnalysis(null);
    setError(null);
    setSuccessMessage('');
  };

  const analyzePhotos = async ({ questionnaireAnswers, complianceContext } = {}) => {
    const readyPhotos = photos.filter(Boolean);

    if (readyPhotos.length < MAX_PHOTO_COUNT) {
      const missingViews = hairAnalysisRequiredViews
        .filter((_view, index) => !photos[index])
        .map((view) => view.label)
        .join(', ');

      const mappedError = createErrorState(
        'More Hair Views Needed',
        `Please add these required hair views before analysis: ${missingViews}.`
      );
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    setIsAnalyzing(true);
    setError(null);
    setSuccessMessage('');

    const submissionContext = analyzerContext.latestSubmission
      ? {
          submission_id: analyzerContext.latestSubmission.submission_id || null,
          donation_drive_id: analyzerContext.latestSubmission.donation_drive_id || null,
          organization_id: analyzerContext.latestSubmission.organization_id || null,
          submission_detail_id: analyzerContext.latestSubmissionDetail?.submission_detail_id || null,
          declared_length: analyzerContext.latestSubmissionDetail?.declared_length ?? null,
          declared_texture: analyzerContext.latestSubmissionDetail?.declared_texture || '',
          declared_density: analyzerContext.latestSubmissionDetail?.declared_density || '',
          declared_condition: analyzerContext.latestSubmissionDetail?.declared_condition || '',
        }
      : null;

    const result = await analyzeHairPhotos({
      images: readyPhotos,
      questionnaireAnswers,
      complianceContext,
      donationRequirementContext: analyzerContext.donationRequirement,
      submissionContext,
    });

    setIsAnalyzing(false);

    if (result.error) {
      setAnalysis(null);
      const mappedError = mapAnalysisError(result.error);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    setAnalysis(result.analysis);
    logAppEvent('donor_hair_submission.analysis', 'Hair analysis ready for rendering.', {
      userId,
      screeningIntent: questionnaireAnswers?.screeningIntent || null,
      analysisKeys: result.analysis ? Object.keys(result.analysis) : [],
      renderKeys: [
        'estimated_length',
        'detected_texture',
        'detected_density',
        'detected_condition',
        'visible_damage_notes',
        'confidence_score',
        'decision',
        'summary',
        'recommendations',
      ],
    });

    return { success: true, analysis: result.analysis };
  };

  const submitSubmission = async (confirmedValues, options = {}) => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage('');

    const result = await saveHairSubmissionFlow({
      userId,
      photos: photos.filter(Boolean),
      aiAnalysis: analysis,
      confirmedValues,
      questionnaireAnswers: options.questionnaireAnswers,
      donationModeValue: options.donationModeValue || '',
      logisticsSettings: analyzerContext.logisticsSettings,
    });

    setIsSaving(false);

    if (result.error) {
      const mappedError = mapSaveError(result.error);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    setSuccessMessage('Hair submission saved successfully. Your AI result, donor-confirmed details, and guidance recommendations are now linked to the submission.');
    setPhotos(createEmptyPhotoSlots());
    setAnalysis(null);
    return { success: true, submission: result.submission };
  };

  const resetFlow = () => {
    setPhotos(createEmptyPhotoSlots());
    setAnalysis(null);
    setError(null);
    setSuccessMessage('');
  };

  return {
    photos,
    requiredViews: hairAnalysisRequiredViews,
    analysis,
    donationRequirement: analyzerContext.donationRequirement,
    logisticsSettings: analyzerContext.logisticsSettings,
    upcomingHaircutSchedules: analyzerContext.upcomingHaircutSchedules,
    latestHaircutReservation: analyzerContext.latestHaircutReservation,
    latestCertificate: analyzerContext.latestCertificate,
    latestSubmission: analyzerContext.latestSubmission,
    latestSubmissionDetail: analyzerContext.latestSubmissionDetail,
    error,
    successMessage,
    isLoadingContext,
    isPickingImages,
    isCapturingImages,
    isAnalyzing,
    isSaving,
    canAnalyze,
    completedPhotoCount,
    progressLabel,
    pickPhotoForSlot,
    capturePhotoForSlot,
    removePhoto,
    analyzePhotos,
    submitSubmission,
    resetFlow,
  };
};
