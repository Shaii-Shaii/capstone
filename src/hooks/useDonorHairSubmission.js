import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
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

const supportsMobileWebCameraCapture = () => {
  if (typeof navigator === 'undefined') return false;

  const userAgent = navigator.userAgent || '';
  return /android|iphone|ipad|ipod/i.test(userAgent);
};

const readWebFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();

  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Unable to read the selected hair image.'));
  reader.readAsDataURL(file);
});

const pickWebImageAsset = async ({ capture = false } = {}) => {
  if (typeof document === 'undefined') {
    throw new Error(capture
      ? 'Camera capture is not available in this environment.'
      : 'Image upload is not available in this environment.');
  }

  if (capture && !supportsMobileWebCameraCapture()) {
    throw new Error('Camera capture is not available in this browser. Use Upload instead.');
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    if (capture) {
      input.setAttribute('capture', 'environment');
    }

    input.onchange = async () => {
      const file = input.files?.[0];

      if (!file) {
        resolve({ canceled: true });
        return;
      }

      try {
        const dataUrl = await readWebFileAsDataUrl(file);
        const [, base64 = ''] = String(dataUrl).split(',');

        resolve({
          canceled: false,
          assets: [{
            uri: dataUrl,
            base64,
            mimeType: file.type || 'image/jpeg',
            assetId: file.name || `${Date.now()}`,
            file,
            fileName: file.name || '',
            width: undefined,
            height: undefined,
          }],
        });
      } catch (error) {
        reject(error);
      }
    };

    input.onerror = () => reject(new Error(capture
      ? 'Unable to open the camera right now.'
      : 'Unable to open the image picker right now.'));

    input.click();
  });
};

const mapImagePickerError = (message = '') => {
  const normalized = message.toLowerCase();

  if (normalized.includes('photo library access')) {
    return createErrorState('Photo Access Needed', 'Allow photo library access first so you can upload hair images.');
  }

  if (normalized.includes('camera access')) {
    return createErrorState('Camera Access Needed', 'Allow camera access first so you can take guided hair photos.');
  }

  if (normalized.includes('camera capture is not available')) {
    return createErrorState('Camera Unavailable', 'Camera capture is not available here. Use Upload instead to continue this screening step.');
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

  if (normalized.includes('too large for analysis')) {
    return createErrorState('Photos Too Large', 'The uploaded hair photos are too large for AI analysis right now. Please retake or upload clearer but smaller images and try again.');
  }

  if (normalized.includes('could not be processed for ai analysis')) {
    return createErrorState('Photos Could Not Be Processed', 'One of the uploaded hair photos could not be processed for AI analysis. Please retake or upload that view again.');
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

  if (normalized.includes('create the hair submission')) {
    return createErrorState('Submission Could Not Start', 'The donation submission record could not be created right now. Please try again.');
  }

  if (normalized.includes('save the donor-confirmed hair details')) {
    return createErrorState('Details Could Not Be Saved', 'Your confirmed hair details could not be saved right now. Please review them and try again.');
  }

  if (normalized.includes('failed to upload one of the selected photos')
    || normalized.includes('uploaded image references')
    || normalized.includes('missing its upload source')
    || normalized.includes('failed to read one of the required hair photos before upload')) {
    return createErrorState('Photo Save Failed', 'One of the required hair photos could not be attached to the submission. Please retake or upload that image again and try saving.');
  }

  if (normalized.includes('selected donation logistics path')) {
    return createErrorState('Donation Path Could Not Be Saved', 'The selected donation path could not be saved right now. Please try again.');
  }

  if (normalized.includes('ai screening result')) {
    return createErrorState('Screening Result Could Not Be Saved', 'The AI screening result could not be linked to the donation right now. Please try again.');
  }

  return createErrorState('Unable To Save Donation', 'Your donation details were not saved yet. Please review the form and try again.');
};

const buildPhotoRecord = (asset, slotIndex, sourceType = 'upload') => {
  if (!asset?.uri || !asset?.base64) return null;

  const view = hairAnalysisRequiredViews[slotIndex];
  return {
    id: asset.assetId || `${asset.uri}-${view?.key || slotIndex}`,
    uri: asset.uri,
    base64: asset.base64,
    mimeType: asset.mimeType || 'image/jpeg',
    width: asset.width,
    height: asset.height,
    dataUrl: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
    viewKey: view?.key || `view_${slotIndex + 1}`,
    viewLabel: view?.label || `View ${slotIndex + 1}`,
    file: asset.file || null,
    fileName: asset.fileName || asset.file?.name || '',
    sourceType,
  };
};

export const useDonorHairSubmission = ({ userId, databaseUserId = null }) => {
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
    const contextUserId = databaseUserId || userId;
    if (!contextUserId) return;

    const loadContext = async () => {
      setIsLoadingContext(true);
      const result = await getHairDonationModuleContext(contextUserId);
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
        databaseUserId,
        hasDonationRequirement: Boolean(result.donationRequirement?.donation_requirement_id),
        pickupEnabled: result.logisticsSettings?.is_pickup_enabled ?? null,
        haircutScheduleCount: Array.isArray(result.upcomingHaircutSchedules) ? result.upcomingHaircutSchedules.length : 0,
        latestSubmissionId: result.latestSubmission?.submission_id || null,
        latestSubmissionDetailId: result.latestSubmissionDetail?.submission_detail_id || null,
        hasError: Boolean(result.error),
      });
    };

    loadContext();
  }, [databaseUserId, userId]);

  const setPhotoAtSlot = (slotIndex, photo) => {
    logAppEvent('donor_hair_submission.photo_slot_state', 'Hair photo slot updated.', {
      userId,
      slotIndex,
      viewKey: photo?.viewKey || hairAnalysisRequiredViews[slotIndex]?.key || null,
      sourceType: photo?.sourceType || null,
      hasPhoto: Boolean(photo?.uri),
    });

    setPhotos((current) => {
      const next = [...current];
      next[slotIndex] = photo;
      return next;
    });
    setAnalysis(null);
    setError(null);
    setSuccessMessage('');
  };

  const savePhotoAssetForSlot = (slotIndex, asset, sourceType = 'upload') => {
    const normalizedPhoto = buildPhotoRecord(asset, slotIndex, sourceType);

    if (!normalizedPhoto) {
      const mappedError = createErrorState('Photos Could Not Be Read', 'Please choose a clear image file again. The selected photo could not be processed.');
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    setPhotoAtSlot(slotIndex, normalizedPhoto);
    logAppEvent('donor_hair_submission.photo_slot', 'Hair photo saved for slot.', {
      userId,
      slotIndex,
      viewKey: normalizedPhoto.viewKey,
      sourceType,
    });

    return { success: true, photo: normalizedPhoto };
  };

  const pickPhotoForSlot = async (slotIndex) => {
    try {
      setError(null);
      setSuccessMessage('');
      setIsPickingImages(true);

      logAppEvent('donor_hair_submission.photo_picker', 'Upload button pressed for hair photo slot.', {
        userId,
        slotIndex,
        viewKey: hairAnalysisRequiredViews[slotIndex]?.key || null,
      });

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      logAppEvent('donor_hair_submission.photo_picker', 'Upload permission resolved for hair photo slot.', {
        userId,
        slotIndex,
        granted: permission.granted,
      });

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

      logAppEvent('donor_hair_submission.photo_picker', 'Upload handler received image for hair photo slot.', {
        userId,
        slotIndex,
        hasAsset: Boolean(result.assets?.[0]?.uri),
      });

      const saveResult = savePhotoAssetForSlot(slotIndex, result.assets?.[0], 'upload');
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Unable to read the selected hair images.');
      }

      return saveResult;
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

      logAppEvent('donor_hair_submission.photo_camera', 'Capture button pressed for hair photo slot.', {
        userId,
        slotIndex,
        viewKey: hairAnalysisRequiredViews[slotIndex]?.key || null,
        platform: Platform.OS,
      });

      let result;

      if (Platform.OS === 'web') {
        logAppEvent('donor_hair_submission.photo_camera', 'Web camera capture handler invoked for hair photo slot.', {
          userId,
          slotIndex,
          viewKey: hairAnalysisRequiredViews[slotIndex]?.key || null,
        });
        result = await pickWebImageAsset({ capture: true });
      } else {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        logAppEvent('donor_hair_submission.photo_camera', 'Camera permission resolved for hair photo slot.', {
          userId,
          slotIndex,
          granted: permission.granted,
        });

        if (!permission.granted) {
          throw new Error('Please allow camera access to take guided hair photos.');
        }

        result = await ImagePicker.launchCameraAsync({
          mediaTypes: IMAGE_MEDIA_TYPES,
          quality: 1,
          base64: true,
          cameraType: ImagePicker.CameraType.back,
        });
      }

      setIsCapturingImages(false);
      if (result.canceled) {
        return { success: false, canceled: true };
      }

      logAppEvent('donor_hair_submission.photo_camera', 'Camera handler received image for hair photo slot.', {
        userId,
        slotIndex,
        hasAsset: Boolean(result.assets?.[0]?.uri),
      });

      const saveResult = savePhotoAssetForSlot(slotIndex, result.assets?.[0], 'capture');
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Unable to read the selected hair images.');
      }

      return saveResult;
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

    logAppEvent('donor_hair_submission.save', 'Hair donation save started from final wizard step.', {
      userId,
      databaseUserId,
      photoCount: photos.filter(Boolean).length,
      hasAnalysis: Boolean(analysis),
      donationModeValue: options.donationModeValue || '',
      confirmedValueKeys: Object.keys(confirmedValues || {}),
    });

    const result = await saveHairSubmissionFlow({
      userId,
      databaseUserId,
      photos: photos.filter(Boolean),
      aiAnalysis: analysis,
      confirmedValues,
      questionnaireAnswers: options.questionnaireAnswers,
      donationModeValue: options.donationModeValue || '',
      logisticsSettings: analyzerContext.logisticsSettings,
    });

    setIsSaving(false);

    if (result.error) {
      logAppEvent('donor_hair_submission.save', 'Hair donation save failed in hook.', {
        userId,
        message: result.error,
      }, 'error');

      const mappedError = mapSaveError(result.error);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    logAppEvent('donor_hair_submission.save', 'Hair donation save completed in hook.', {
      userId,
      submissionId: result.submission?.submission_id || null,
    });

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
    savePhotoAssetForSlot,
    removePhoto,
    analyzePhotos,
    submitSubmission,
    resetFlow,
  };
};
