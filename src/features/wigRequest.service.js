import * as WigRequestAPI from './wigRequest.api';
import {
  buildImmediateNotificationEvents,
  recordNotifications,
} from './notification.service';
import {
  createPatientDetails,
  fetchPatientDetailsByUserId,
  resolveSystemUser,
  updatePatientPictureByPatientId,
} from './profile/api/profile.api';
import { wigRequestStatuses } from './wigRequest.constants';

const getFileExtension = (mimeType = 'image/jpeg') => {
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  return 'jpg';
};

const buildReferenceImageUrl = async ({ userId, referenceImage }) => {
  if (!referenceImage?.uri) return null;

  const fileResponse = await fetch(referenceImage.uri);
  const fileBody = await fileResponse.arrayBuffer();
  const extension = getFileExtension(referenceImage.mimeType);
  const filePath = `${userId}/wig-reference-${Date.now()}.${extension}`;

  const uploadResult = await WigRequestAPI.uploadWigReferenceImage({
    path: filePath,
    fileBody,
    contentType: referenceImage.mimeType || 'image/jpeg',
  });

  if (uploadResult.error) {
    throw new Error(uploadResult.error.message || 'Unable to upload the reference image.');
  }

  const { data } = WigRequestAPI.getStoragePublicUrl({ path: filePath });
  return data?.publicUrl || filePath;
};

const ensurePatientDetails = async (userId) => {
  const { data: existingPatientDetails, error: patientDetailsError } = await fetchPatientDetailsByUserId(userId);
  if (patientDetailsError) {
    throw new Error(patientDetailsError.message || 'Unable to load patient details.');
  }

  if (existingPatientDetails?.id) {
    return existingPatientDetails;
  }

  const { data: createdPatientDetails, error: createPatientDetailsError } = await createPatientDetails({
    user_id: userId,
  });

  if (!createPatientDetailsError && createdPatientDetails?.id) {
    return createdPatientDetails;
  }

  const createErrorMessage = String(createPatientDetailsError?.message || '').toLowerCase();
  if (createErrorMessage.includes('duplicate') || createErrorMessage.includes('already exists')) {
    const { data: retriedPatientDetails, error: retriedPatientDetailsError } = await fetchPatientDetailsByUserId(userId);
    if (retriedPatientDetailsError) {
      throw new Error(retriedPatientDetailsError.message || 'Unable to load patient details.');
    }

    if (retriedPatientDetails?.id) {
      return retriedPatientDetails;
    }
  }

  throw new Error(
    createPatientDetailsError?.message
    || 'Unable to prepare the patient record needed for wig requests.'
  );
};

export const getPatientWigRequestContext = async (userId) => {
  try {
    if (!userId) {
      throw new Error('Your session is not ready.');
    }

    const patientDetails = await ensurePatientDetails(userId);

    const [{ data: latestWigRequest, error: wigRequestError }, { data: latestAllocation, error: allocationError }] =
      await Promise.all([
        WigRequestAPI.fetchLatestWigRequestByPatientDetailsId(patientDetails.id),
        WigRequestAPI.fetchLatestWigAllocationByPatientDetailsId(patientDetails.id),
      ]);

    if (wigRequestError) {
      throw new Error(wigRequestError.message || 'Unable to load the latest wig request.');
    }

    if (allocationError) {
      throw new Error(allocationError.message || 'Unable to load the latest wig allocation.');
    }

    const { data: latestWigSpecification, error: wigSpecificationError } = latestWigRequest?.id
      ? await WigRequestAPI.fetchLatestWigSpecificationByRequestId(latestWigRequest.id)
      : { data: null, error: null };

    if (wigSpecificationError) {
      throw new Error(wigSpecificationError.message || 'Unable to load the latest wig specification.');
    }

    return {
      patientDetails,
      latestWigRequest,
      latestWigSpecification,
      latestAllocation,
      error: null,
    };
  } catch (error) {
    return {
      patientDetails: null,
      latestWigRequest: null,
      latestWigSpecification: null,
      latestAllocation: null,
      error: error.message || 'Unable to load the patient wig request context.',
    };
  }
};

export const savePatientWigRequestFlow = async ({
  userId,
  preferences,
  preview,
  referenceImage,
}) => {
  try {
    if (!userId) throw new Error('Your session is not ready.');

    const patientDetails = await ensurePatientDetails(userId);

    const referenceImageUrl = await buildReferenceImageUrl({ userId, referenceImage });
    const { data: systemUser, error: systemUserError } = await resolveSystemUser(userId);
    if (systemUserError) {
      throw new Error(systemUserError.message || 'Unable to resolve the patient account.');
    }

    if (referenceImageUrl && patientDetails.id) {
      const patientPictureResult = await updatePatientPictureByPatientId(patientDetails.id, referenceImageUrl);
      if (patientPictureResult.error) {
        throw new Error(patientPictureResult.error.message || 'Unable to save the patient reference photo.');
      }
    }

    const { data: wigRequest, error: wigRequestError } = await WigRequestAPI.createWigRequest({
      patient_id: patientDetails.id,
      hospital_id: patientDetails.hospital_id || null,
      requested_by: systemUser?.user_id || null,
      request_date: new Date().toISOString(),
      status: wigRequestStatuses.pending,
    });

    if (wigRequestError) {
      throw new Error(wigRequestError.message || 'Unable to create the wig request.');
    }

    const { data: wigSpecification, error: wigSpecificationError } = await WigRequestAPI.createWigSpecification({
      wig_request_id: wigRequest.id,
      preferred_color: preferences.preferredColor,
      preferred_length: preferences.preferredLength,
      hair_texture: null,
      cap_size: null,
      style_preference: preview?.recommended_style_name || null,
      notes: [preferences.notes, preview?.style_notes, preview?.summary].filter(Boolean).join('\n\n') || null,
    });

    if (wigSpecificationError) {
      throw new Error(wigSpecificationError.message || 'Unable to save the wig specifications.');
    }

    const notificationEvents = buildImmediateNotificationEvents({
      role: 'patient',
      payload: {
        wigRequest,
      },
    });

    if (notificationEvents.length) {
      await recordNotifications({
        userId,
        role: 'patient',
        notifications: notificationEvents,
      });
    }

    return {
      wigRequest,
      wigSpecification,
      error: null,
    };
  } catch (error) {
    return {
      wigRequest: null,
      wigSpecification: null,
      error: error.message || 'Unable to save the wig request.',
    };
  }
};
