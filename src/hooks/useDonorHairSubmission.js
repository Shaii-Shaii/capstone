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

const mapImagePickerError = (message = '') => {
  const normalized = message.toLowerCase();

  if (normalized.includes('photo library access')) {
    return createErrorState(
      'Photo Access Needed',
      'Allow photo library access first so you can upload hair images.'
    );
  }

  if (normalized.includes('camera access')) {
    return createErrorState(
      'Camera Access Needed',
      'Allow camera access first so you can take guided hair photos.'
    );
  }

  if (normalized.includes('read the selected hair images')) {
    return createErrorState(
      'Photos Could Not Be Read',
      'Please choose clear image files again. The selected photos could not be processed.'
    );
  }

  if (normalized.includes('please select 4 photos')) {
    return createErrorState(
      'Four Hair Views Needed',
      message
    );
  }

  return createErrorState(
    'Unable To Upload Photos',
    'We could not open your selected photos right now. Please try again.'
  );
};

const mapAnalysisError = (message = '') => {
  const normalized = message.toLowerCase();

  if (normalized.includes('at least one hair photo')) {
    return createErrorState(
      'Upload Photos First',
      'Add at least one clear hair photo before running the analysis.'
    );
  }

  if (normalized.includes('response was incomplete')) {
    return createErrorState(
      'Analysis Was Incomplete',
      'The scan did not finish properly. Please try analyzing the photos again.'
    );
  }

  if (normalized.includes('session has expired') || normalized.includes('sign in again')) {
    return createErrorState(
      'Session Expired',
      'Please sign in again to continue the hair analysis.'
    );
  }

  if (normalized.includes('could not be read')) {
    return createErrorState(
      'Photo Could Not Be Read',
      'One of the uploaded photos could not be processed. Please upload or retake that hair view again.'
    );
  }

  if (normalized.includes('does not clearly show hair') || normalized.includes('not look like hair')) {
    return createErrorState(
      'Hair Not Detected',
      'The uploaded photo does not clearly show hair. Please upload clear hair photos only.'
    );
  }

  if (
    normalized.includes('front view photo')
    || normalized.includes('back view photo')
    || normalized.includes('hair ends close-up')
    || normalized.includes('side view photo')
  ) {
    return createErrorState(
      'More Hair Views Needed',
      message
    );
  }

  if (normalized.includes('not clear enough for a reliable hair analysis')) {
    return createErrorState(
      'Photos Need Better Clarity',
      'The uploaded hair photos were too unclear for a reliable result. Please retake them in brighter light and keep the hair centered.'
    );
  }

  return createErrorState(
    'Analysis Unavailable',
    'We could not analyze the uploaded hair photos right now. Please try again in a moment.'
  );
};

const mapSaveError = (message = '') => {
  const normalized = message.toLowerCase();

  if (normalized.includes('session is not ready')) {
    return createErrorState(
      'Session Not Ready',
      'Please reopen the donation screen and try again.'
    );
  }

  if (normalized.includes('upload at least one photo')) {
    return createErrorState(
      'Photos Are Required',
      'Upload hair photos first before saving the donation.'
    );
  }

  if (normalized.includes('run the ai analysis')) {
    return createErrorState(
      'Analysis Needed',
      'Wait for the AI result or run the analysis again before saving.'
    );
  }

  return createErrorState(
    'Unable To Save Donation',
    'Your donation details were not saved yet. Please review the form and try again.'
  );
};

const normalizePickedAssets = (assets = []) => (
  assets
    .filter((asset) => asset?.uri)
    .map((asset, index) => ({
      id: asset.assetId || `${asset.uri}-${index}`,
      uri: asset.uri,
      mimeType: asset.mimeType || 'image/jpeg',
      width: asset.width,
      height: asset.height,
      dataUrl: asset.base64 ? `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` : null,
      viewKey: hairAnalysisRequiredViews[index]?.key || `view_${index + 1}`,
      viewLabel: hairAnalysisRequiredViews[index]?.label || `View ${index + 1}`,
    }))
    .filter((asset) => asset.dataUrl)
);

const normalizeCapturedAsset = (asset, view, fallbackIndex) => {
  if (!asset?.uri || !asset?.base64) return null;

  return {
    id: asset.assetId || `${asset.uri}-${view?.key || fallbackIndex}`,
    uri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
    width: asset.width,
    height: asset.height,
    dataUrl: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
    viewKey: view?.key || `view_${fallbackIndex + 1}`,
    viewLabel: view?.label || `View ${fallbackIndex + 1}`,
  };
};

const readSinglePickedAsset = (asset, view, fallbackIndex) => (
  normalizeCapturedAsset(
    {
      uri: asset?.uri,
      base64: asset?.base64,
      mimeType: asset?.mimeType,
      width: asset?.width,
      height: asset?.height,
      assetId: asset?.assetId,
    },
    view,
    fallbackIndex
  )
);

export const useDonorHairSubmission = ({ userId }) => {
  const [photos, setPhotos] = useState([]);
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
  const [isGuidedCaptureOpen, setIsGuidedCaptureOpen] = useState(false);
  const [guidedCaptureIndex, setGuidedCaptureIndex] = useState(0);
  const [guidedPhotos, setGuidedPhotos] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const hasCompletePhotoSet = photos.length === MAX_PHOTO_COUNT;
  const canAnalyze = hasCompletePhotoSet && !isAnalyzing;
  const currentGuidedView = hairAnalysisRequiredViews[guidedCaptureIndex] || null;
  const currentGuidedPhoto = guidedPhotos[guidedCaptureIndex] || null;
  const capturedGuideCount = guidedPhotos.filter(Boolean).length;
  const canAdvanceGuide = Boolean(currentGuidedPhoto);

  const progressLabel = useMemo(() => {
    if (isSaving) return 'Saving your submission';
    if (isAnalyzing) return 'Running AI analysis';
    if (analysis) return 'Review AI result';
    if (hasCompletePhotoSet) return 'Ready for AI analysis';
    if (photos.length) return `${MAX_PHOTO_COUNT - photos.length} more view${MAX_PHOTO_COUNT - photos.length === 1 ? '' : 's'} needed`;
    return 'Ready to start screening';
  }, [analysis, hasCompletePhotoSet, isAnalyzing, isSaving, photos.length]);

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

  const runAnalysis = async ({
    sourcePhotos = photos,
    questionnaireAnswers,
    complianceContext = null,
  } = {}) => {
    if (sourcePhotos.length < MAX_PHOTO_COUNT) {
      const missingViews = hairAnalysisRequiredViews.slice(sourcePhotos.length).map((view) => view.label).join(', ');
      const mappedError = createErrorState(
        'More Hair Views Needed',
        `Please upload these hair views in order before analysis: ${missingViews}.`
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
      images: sourcePhotos,
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

  const pickImages = async () => {
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
        allowsMultipleSelection: true,
        quality: 1,
        base64: true,
        selectionLimit: MAX_PHOTO_COUNT,
      });

      setIsPickingImages(false);
      if (result.canceled) return;

      const selectedPhotos = normalizePickedAssets(result.assets);
      if (!selectedPhotos.length) {
        throw new Error('Unable to read the selected hair images.');
      }

      if (selectedPhotos.length < MAX_PHOTO_COUNT) {
        throw new Error(`Please select 4 photos in this order: ${hairAnalysisRequiredViews.map((view) => view.label).join(', ')}.`);
      }

      setPhotos(selectedPhotos.slice(0, MAX_PHOTO_COUNT));
      setAnalysis(null);
      logAppEvent('donor_hair_submission.images', 'Hair image set ready from library.', {
        userId,
        photoCount: selectedPhotos.slice(0, MAX_PHOTO_COUNT).length,
      });
    } catch (error) {
      setIsPickingImages(false);
      setError(mapImagePickerError(error.message));
    }
  };

  const startGuidedCapture = async () => {
    setError(null);
    setSuccessMessage('');
    setGuidedPhotos([]);
    setGuidedCaptureIndex(0);
    setAnalysis(null);
    setIsGuidedCaptureOpen(true);
  };

  const pickImageForCurrentView = async () => {
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

      const selectedPhoto = readSinglePickedAsset(
        result.assets?.[0],
        currentGuidedView,
        guidedCaptureIndex
      );

      if (!selectedPhoto) {
        throw new Error('Unable to read the selected hair images.');
      }

      setGuidedPhotos((current) => {
        const next = [...current];
        next[guidedCaptureIndex] = selectedPhoto;
        return next;
      });

      return { success: true, photo: selectedPhoto };
    } catch (error) {
      setIsPickingImages(false);
      const mappedError = mapImagePickerError(error.message);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }
  };

  const saveGuidedPhoto = (asset) => {
    const capturedPhoto = normalizeCapturedAsset(asset, currentGuidedView, guidedCaptureIndex);

    if (!capturedPhoto) {
      const mappedError = createErrorState(
        'Photo Could Not Be Read',
        'We could not read the captured photo. Please take the picture again.'
      );
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    setError(null);
    setGuidedPhotos((current) => {
      const next = [...current];
      next[guidedCaptureIndex] = capturedPhoto;
      return next;
    });

    return { success: true, photo: capturedPhoto };
  };

  const clearCurrentGuidedPhoto = () => {
    setGuidedPhotos((current) => {
      const next = [...current];
      next[guidedCaptureIndex] = undefined;
      return next;
    });
  };

  const closeGuidedCapture = () => {
    setIsGuidedCaptureOpen(false);
    setGuidedCaptureIndex(0);
    setGuidedPhotos([]);
  };

  const advanceGuidedCapture = async () => {
    if (!canAdvanceGuide) {
      const mappedError = createErrorState(
        'Capture Needed',
        `Take the ${currentGuidedView?.label || 'required'} photo first before continuing.`
      );
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    if (guidedCaptureIndex < MAX_PHOTO_COUNT - 1) {
      setGuidedCaptureIndex((current) => current + 1);
      return { success: true, completed: false };
    }

    const completedPhotos = guidedPhotos.filter(Boolean).slice(0, MAX_PHOTO_COUNT);
    setPhotos(completedPhotos);
    setAnalysis(null);
    setIsGuidedCaptureOpen(false);
    setGuidedCaptureIndex(0);
    setGuidedPhotos([]);
    logAppEvent('donor_hair_submission.guided_capture', 'Guided capture complete.', {
      userId,
      photoCount: completedPhotos.length,
    });

    return { success: true, completed: true, photos: completedPhotos };
  };

  const removePhoto = (photoId) => {
    setPhotos((current) => current.filter((photo) => photo.id !== photoId));
    setAnalysis(null);
    setError(null);
    setSuccessMessage('');
  };

  const analyzePhotos = async ({ questionnaireAnswers, complianceContext } = {}) => (
    await runAnalysis({ sourcePhotos: photos, questionnaireAnswers, complianceContext })
  );

  const submitSubmission = async (confirmedValues, options = {}) => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage('');

    const result = await saveHairSubmissionFlow({
      userId,
      photos,
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
    setPhotos([]);
    setAnalysis(null);
    return { success: true, submission: result.submission };
  };

  const resetFlow = () => {
    setPhotos([]);
    setAnalysis(null);
    setError(null);
    setSuccessMessage('');
    closeGuidedCapture();
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
    isGuidedCaptureOpen,
    currentGuidedView,
    currentGuidedPhoto,
    capturedGuideCount,
    isAnalyzing,
    isSaving,
    canAnalyze,
    progressLabel,
    pickImages,
    pickImageForCurrentView,
    startGuidedCapture,
    saveGuidedPhoto,
    clearCurrentGuidedPhoto,
    advanceGuidedCapture,
    closeGuidedCapture,
    removePhoto,
    analyzePhotos,
    submitSubmission,
    resetFlow,
  };
};
