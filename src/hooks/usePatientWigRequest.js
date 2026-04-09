import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { generatePatientWigPreview } from '../features/wigGeneration.service';
import {
  getPatientWigRequestContext,
  savePatientWigRequestFlow,
} from '../features/wigRequest.service';
import { createAppError, getErrorMessage, logAppError } from '../utils/appErrors';

const IMAGE_MEDIA_TYPES = ['images'];

const FRONT_PHOTO_REQUIRED_ERROR = createAppError(
  'Front Photo Required',
  'Add one clear front photo first so we can suggest a wig for your request.'
);

const WIG_SUGGESTION_REQUIRED_ERROR = createAppError(
  'Wig Suggestion Needed',
  'Generate the wig suggestion first so you can review it before submitting your request.'
);

const mapPatientWigRequestError = (type, error) => {
  const message = getErrorMessage(error).toLowerCase();

  if (type === 'context') {
    return createAppError(
      'Unable To Load Request',
      'We could not load your wig request details right now. Please try again.'
    );
  }

  if (type === 'picker') {
    if (message.includes('photo library access')) {
      return createAppError(
        'Photo Access Needed',
        'Allow photo library access first so you can upload your front photo.'
      );
    }

    if (message.includes('read the selected front photo')) {
      return createAppError(
        'Photo Could Not Be Read',
        'Please choose the front photo again.'
      );
    }

    return createAppError(
      'Unable To Add Photo',
      'We could not attach that front photo right now. Please try again.'
    );
  }

  if (type === 'capture') {
    return createAppError(
      'Camera Photo Unavailable',
      'We could not save that front photo. Please take it again.'
    );
  }

  if (type === 'preview') {
    if (message.includes('front photo')) {
      return createAppError(
        'Front Photo Required',
        'Please upload a clear front photo first.'
      );
    }

    if (message.includes('sign in again') || message.includes('session has expired')) {
      return createAppError(
        'Session Expired',
        'Please sign in again to continue the wig preview.'
      );
    }

    return createAppError(
      'Suggestion Unavailable',
      'Preview could not be generated right now.'
    );
  }

  if (type === 'save') {
    return createAppError(
      'Unable To Save Request',
      'Your wig request was not saved yet. Please review the details and try again.'
    );
  }

  return createAppError(
    'Something Went Wrong',
    'Please try again.'
  );
};

const normalizeFrontPhotoAsset = (asset) => {
  if (!asset?.uri || !asset?.base64) return null;

  return {
    id: asset.assetId || asset.uri,
    uri: asset.uri,
    mimeType: asset.mimeType || 'image/jpeg',
    width: asset.width,
    height: asset.height,
    dataUrl: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`,
  };
};

const buildStoredFrontPhoto = (uri, requestId) => (
  uri
    ? {
        id: `stored-front-photo-${requestId || 'latest'}`,
        uri,
        mimeType: 'image/jpeg',
      }
    : null
);

const buildStoredPreview = (specification, wigRequest) => {
  const hasStoredGuidance = Boolean(
    specification?.style_preference
    || specification?.preferred_length
    || specification?.preferred_color
    || specification?.notes
    || wigRequest?.notes
    || specification?.ai_wig_preview_url
  );

  if (!hasStoredGuidance) {
    return null;
  }

  const summaryParts = [
    wigRequest?.notes || '',
    specification?.notes || '',
  ].filter(Boolean);

  return {
    summary: summaryParts.join('\n\n') || 'Saved wig recommendation.',
    style_notes: specification?.notes || '',
    recommended_style_name: specification?.style_preference || 'Saved wig recommendation',
    recommended_style_family: specification?.preferred_length || 'Saved recommendation',
    generated_image_data_url: specification?.ai_wig_preview_url || '',
    options: [],
  };
};

export const usePatientWigRequest = ({ userId }) => {
  const [referenceImage, setReferenceImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [context, setContext] = useState({
    patientDetails: null,
    latestAllocation: null,
    latestWigRequest: null,
    latestWigSpecification: null,
  });
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isPickingReference, setIsPickingReference] = useState(false);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isSavingRequest, setIsSavingRequest] = useState(false);
  const [requestedSavedPreviewId, setRequestedSavedPreviewId] = useState(null);

  const hasSubmittedRequest = Boolean(context.latestWigRequest?.req_id);

  const progressLabel = useMemo(() => {
    if (isSavingRequest) return 'Submitting wig request';
    if (isGeneratingPreview) return hasSubmittedRequest ? 'Refreshing wig suggestion' : 'Generating wig suggestion';
    if (hasSubmittedRequest) return 'Wig request submitted';
    if (preview) return 'Review wig suggestion';
    return 'Start a wig request';
  }, [hasSubmittedRequest, isGeneratingPreview, isSavingRequest, preview]);

  const buildSavedPreferences = useCallback(() => ({
    preferredColor: context.latestWigSpecification?.preferred_color || '',
    preferredLength: context.latestWigSpecification?.preferred_length || '',
    notes: context.latestWigRequest?.notes || context.latestWigSpecification?.notes || '',
  }), [
    context.latestWigRequest?.notes,
    context.latestWigSpecification?.notes,
    context.latestWigSpecification?.preferred_color,
    context.latestWigSpecification?.preferred_length,
  ]);

  const buildSavedReferenceImage = useCallback(() => (
    buildStoredFrontPhoto(
      context.latestWigSpecification?.patient_picture,
      context.latestWigRequest?.req_id
    )
  ), [
    context.latestWigRequest?.req_id,
    context.latestWigSpecification?.patient_picture,
  ]);

  const refreshContext = useCallback(async () => {
    setIsLoadingContext(true);
    setError(null);

    const result = await getPatientWigRequestContext(userId);

    setIsLoadingContext(false);
    setContext({
      patientDetails: result.patientDetails,
      latestAllocation: result.latestAllocation,
      latestWigRequest: result.latestWigRequest,
      latestWigSpecification: result.latestWigSpecification,
    });

    if (result.latestWigRequest?.req_id && result.latestWigSpecification?.patient_picture) {
      const storedFrontPhoto = buildStoredFrontPhoto(
        result.latestWigSpecification.patient_picture,
        result.latestWigRequest.req_id
      );

      setReferenceImage((current) => {
        if (current?.dataUrl) return current;
        if (current?.uri === storedFrontPhoto?.uri) return current;
        return storedFrontPhoto;
      });
    }

    const storedPreview = buildStoredPreview(result.latestWigSpecification, result.latestWigRequest);
    if (storedPreview) {
      setPreview((current) => current || storedPreview);
    }

    if (result.error) {
      logAppError('patientWigRequest.refreshContext', result.error, { userId });
      const mappedError = mapPatientWigRequestError('context', result.error);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    return { success: true };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    refreshContext();
  }, [refreshContext, userId]);

  useEffect(() => {
    setRequestedSavedPreviewId(null);
  }, [context.latestWigRequest?.req_id]);

  const requestPreview = useCallback(async ({
    preferences,
    imageSource,
    preservePreviewOnError = false,
  }) => {
    setIsGeneratingPreview(true);
    setError(null);
    setSuccessMessage('');

    const result = await generatePatientWigPreview({
      preferences,
      referenceImage: imageSource,
    });

    setIsGeneratingPreview(false);

    if (result.error) {
      if (!preservePreviewOnError) {
        setPreview(null);
      }

      logAppError('patientWigRequest.requestPreview', result.error, { userId });
      const mappedError = mapPatientWigRequestError('preview', result.error);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    setPreview(result.preview);
    return { success: true, preview: result.preview };
  }, [userId]);

  useEffect(() => {
    if (!hasSubmittedRequest) return;
    if (!context.latestWigRequest?.req_id || requestedSavedPreviewId === context.latestWigRequest.req_id) return;
    if (preview || isGeneratingPreview) return;

    const storedFrontPhoto = referenceImage?.uri ? referenceImage : buildSavedReferenceImage();
    if (!storedFrontPhoto?.uri) return;

    setRequestedSavedPreviewId(context.latestWigRequest.req_id);
    requestPreview({
      preferences: buildSavedPreferences(),
      imageSource: storedFrontPhoto,
      preservePreviewOnError: true,
    });
  }, [
    buildSavedPreferences,
    buildSavedReferenceImage,
    context.latestWigRequest?.req_id,
    hasSubmittedRequest,
    isGeneratingPreview,
    preview,
    referenceImage,
    requestPreview,
    requestedSavedPreviewId,
  ]);

  const pickReferenceImage = async () => {
    try {
      setIsPickingReference(true);
      setError(null);
      setSuccessMessage('');

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Please allow photo library access to attach your front photo.');
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: IMAGE_MEDIA_TYPES,
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: false,
      });

      setIsPickingReference(false);
      if (result.canceled) return { success: false, canceled: true };

      const selectedImage = normalizeFrontPhotoAsset(result.assets?.[0]);
      if (!selectedImage) {
        throw new Error('Unable to read the selected front photo.');
      }

      setReferenceImage(selectedImage);
      setPreview(null);
      return { success: true, image: selectedImage };
    } catch (pickerError) {
      setIsPickingReference(false);
      logAppError('patientWigRequest.pickReferenceImage', pickerError, { userId });
      const mappedError = mapPatientWigRequestError('picker', pickerError);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }
  };

  const saveCapturedReferenceImage = (asset) => {
    const capturedImage = normalizeFrontPhotoAsset(asset);

    if (!capturedImage) {
      const mappedError = mapPatientWigRequestError('capture', new Error('Front photo could not be processed.'));
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    setReferenceImage(capturedImage);
    setPreview(null);
    setError(null);
    setSuccessMessage('');
    return { success: true, image: capturedImage };
  };

  const clearReferenceImage = () => {
    setReferenceImage(null);
    setPreview(null);
    setError(null);
    setSuccessMessage('');
  };

  const generatePreview = async (preferences) => {
    if (!referenceImage?.uri) {
      setError(FRONT_PHOTO_REQUIRED_ERROR);
      return { success: false, error: FRONT_PHOTO_REQUIRED_ERROR.message };
    }

    return await requestPreview({
      preferences,
      imageSource: referenceImage,
    });
  };

  const regenerateSavedRecommendation = useCallback(async () => {
    const savedReferenceImage = referenceImage?.uri ? referenceImage : buildSavedReferenceImage();

    if (!savedReferenceImage?.uri) {
      setError(FRONT_PHOTO_REQUIRED_ERROR);
      return { success: false, error: FRONT_PHOTO_REQUIRED_ERROR.message };
    }

    return await requestPreview({
      preferences: buildSavedPreferences(),
      imageSource: savedReferenceImage,
      preservePreviewOnError: true,
    });
  }, [buildSavedPreferences, buildSavedReferenceImage, referenceImage, requestPreview]);

  const saveRequest = async (preferences) => {
    if (!referenceImage?.uri) {
      setError(FRONT_PHOTO_REQUIRED_ERROR);
      return { success: false, error: FRONT_PHOTO_REQUIRED_ERROR.message };
    }

    if (!preview) {
      setError(WIG_SUGGESTION_REQUIRED_ERROR);
      return { success: false, error: WIG_SUGGESTION_REQUIRED_ERROR.message };
    }

    setIsSavingRequest(true);
    setError(null);
    setSuccessMessage('');

    const result = await savePatientWigRequestFlow({
      userId,
      preferences,
      preview,
      referenceImage,
    });

    setIsSavingRequest(false);

    if (result.error) {
      logAppError('patientWigRequest.saveRequest', result.error, { userId });
      const mappedError = mapPatientWigRequestError('save', result.error);
      setError(mappedError);
      return { success: false, error: mappedError.message };
    }

    setSuccessMessage('Wig request submitted successfully. Your status and suggested wig recommendation are now ready to review.');
    await refreshContext();
    return { success: true, wigRequest: result.wigRequest };
  };

  return {
    patientDetails: context.patientDetails,
    latestAllocation: context.latestAllocation,
    latestWigRequest: context.latestWigRequest,
    latestWigSpecification: context.latestWigSpecification,
    hasSubmittedRequest,
    referenceImage,
    preview,
    error,
    successMessage,
    isLoadingContext,
    isPickingReference,
    isGeneratingPreview,
    isSavingRequest,
    progressLabel,
    pickReferenceImage,
    saveCapturedReferenceImage,
    clearReferenceImage,
    generatePreview,
    regenerateSavedRecommendation,
    saveRequest,
    refreshContext,
  };
};
