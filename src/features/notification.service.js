import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NotificationAPI from './notification.api';
import { notificationStoragePrefix, notificationTypes } from './notification.constants';
import {
  fetchDonorRecommendationsBySubmissionId,
  fetchHairSubmissionLogisticsBySubmissionId,
  fetchHairSubmissionsByUserId,
} from './hairSubmission.api';
import {
  fetchLatestWigAllocationByPatientDetailsId,
  fetchLatestWigRequestByPatientDetailsId,
} from './wigRequest.api';
import { fetchPatientDetailsByUserId, resolveDatabaseUserId } from './profile/api/profile.api';

const buildStorageKey = ({ userId, role }) => `${notificationStoragePrefix}.${role}.${userId}`;

const formatDateTime = (value) => {
  if (!value) return new Date().toISOString();

  try {
    return new Date(value).toISOString();
  } catch {
    return new Date().toISOString();
  }
};

const formatReadableDate = (value) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const buildNotification = ({
  dedupeKey,
  type,
  title,
  message,
  createdAt,
  referenceType,
  referenceId,
  backendId = null,
  isRead = false,
}) => ({
  id: backendId || dedupeKey,
  backendId,
  dedupeKey,
  type,
  title,
  message,
  createdAt: formatDateTime(createdAt),
  referenceType: referenceType || null,
  referenceId: referenceId || null,
  isRead,
});

const loadLocalNotifications = async ({ userId, role }) => {
  const rawValue = await AsyncStorage.getItem(buildStorageKey({ userId, role }));
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalNotifications = async ({ userId, role, notifications }) => {
  await AsyncStorage.setItem(
    buildStorageKey({ userId, role }),
    JSON.stringify(notifications)
  );
};

const normalizeBackendNotification = (row) => {
  const createdAt = row?.created_at || row?.updated_at || new Date().toISOString();
  const type = row?.notification_type || row?.type || 'system_update';
  const dedupeKey = row?.dedupe_key
    || row?.external_key
    || `${type}:${row?.reference_type || row?.source_type || 'notification'}:${row?.reference_id || row?.source_id || row?.id}`;

  return buildNotification({
    dedupeKey,
    type,
    title: row?.title || row?.heading || 'System update',
    message: row?.message || row?.body || row?.content || '',
    createdAt,
    referenceType: row?.reference_type || row?.source_type,
    referenceId: row?.reference_id || row?.source_id || row?.id,
    backendId: row?.id || null,
    isRead: Boolean(row?.is_read),
  });
};

const toBackendPayload = ({ databaseUserId, role, notification }) => ({
  user_id: databaseUserId,
  role,
  notification_type: notification.type,
  title: notification.title,
  message: notification.message,
  is_read: notification.isRead,
  reference_type: notification.referenceType,
  reference_id: notification.referenceId,
  created_at: notification.createdAt,
  dedupe_key: notification.dedupeKey,
});

const resolveNotificationBackendUserId = async (userId) => {
  const result = await resolveDatabaseUserId(userId, { ensure: false });
  return result.data || null;
};

const mergeNotifications = ({ localNotifications, backendNotifications, derivedNotifications }) => {
  const merged = new Map();

  [...backendNotifications, ...localNotifications, ...derivedNotifications].forEach((notification) => {
    const existing = merged.get(notification.dedupeKey);

    if (!existing) {
      merged.set(notification.dedupeKey, notification);
      return;
    }

    merged.set(notification.dedupeKey, {
      ...existing,
      ...notification,
      id: notification.backendId || existing.backendId || notification.id || existing.id,
      backendId: notification.backendId || existing.backendId || null,
      isRead: existing.isRead || notification.isRead,
      createdAt: existing.createdAt > notification.createdAt ? existing.createdAt : notification.createdAt,
    });
  });

  return Array.from(merged.values()).sort((left, right) => (
    new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  ));
};

const buildDonorDerivedNotifications = async (userId) => {
  const notifications = [];
  const { data, error } = await fetchHairSubmissionsByUserId(userId, 1);

  if (error) {
    throw new Error(error.message || 'Unable to load donor notifications.');
  }

  const submission = data?.[0];
  const screening = Array.isArray(submission?.ai_screenings)
    ? submission.ai_screenings[0]
    : submission?.ai_screenings;

  if (!submission?.id) {
    return notifications;
  }

  notifications.push(buildNotification({
    dedupeKey: `${notificationTypes.submissionReceived}:${submission.id}`,
    type: notificationTypes.submissionReceived,
    title: 'Submission received',
    message: `Your hair submission ${submission.submission_code || ''} was saved and is now in the review flow.`.trim(),
    createdAt: submission.created_at,
    referenceType: 'hair_submission',
    referenceId: submission.id,
  }));

  if (screening?.id) {
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.screeningCompleted}:${screening.id}`,
      type: notificationTypes.screeningCompleted,
      title: 'AI screening completed',
      message: screening.summary || `Your latest screening result is ${screening.decision || 'ready for review'}.`,
      createdAt: screening.created_at,
      referenceType: 'ai_screening',
      referenceId: screening.id,
    }));

    if (String(screening.decision || '').toLowerCase().includes('eligible')) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.certificateAvailable}:${submission.id}`,
        type: notificationTypes.certificateAvailable,
        title: 'Certificate available',
        message: 'Your donation reached a qualified result and the donor certificate is now available in the donations screen.',
        createdAt: screening.created_at,
        referenceType: 'hair_submission',
        referenceId: submission.id,
      }));
    }
  }

  const { data: recommendations } = await fetchDonorRecommendationsBySubmissionId(submission.id);
  if (recommendations?.length) {
    const topRecommendation = recommendations[0];
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.recommendationAvailable}:${submission.id}`,
      type: notificationTypes.recommendationAvailable,
      title: 'Recommendation available',
      message: topRecommendation.recommendation_text || 'New donor guidance is now available after screening.',
      createdAt: topRecommendation.created_at,
      referenceType: 'hair_submission',
      referenceId: submission.id,
    }));
  }

  const { data: logistics } = await fetchHairSubmissionLogisticsBySubmissionId(submission.id);
  if (logistics?.id) {
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.logisticsUpdated}:${logistics.id}`,
      type: notificationTypes.logisticsUpdated,
      title: 'Logistics update',
      message: logistics.notes
        || [logistics.courier_name, logistics.tracking_number].filter(Boolean).join(' | ')
        || `Shipment status: ${logistics.shipment_status || logistics.logistics_type || 'updated'}.`,
      createdAt: logistics.updated_at || logistics.created_at,
      referenceType: 'hair_submission_logistics',
      referenceId: logistics.id,
    }));
  }

  return notifications;
};

const buildPatientDerivedNotifications = async (userId) => {
  const notifications = [];
  const { data: patientDetails, error: patientDetailsError } = await fetchPatientDetailsByUserId(userId);

  if (patientDetailsError) {
    throw new Error(patientDetailsError.message || 'Unable to load patient notifications.');
  }

  if (!patientDetails?.id) {
    return notifications;
  }

  const [{ data: wigRequest }, { data: latestAllocation }] = await Promise.all([
    fetchLatestWigRequestByPatientDetailsId(patientDetails.id),
    fetchLatestWigAllocationByPatientDetailsId(patientDetails.id),
  ]);

  if (wigRequest?.id) {
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.wigRequestUpdated}:${wigRequest.id}`,
      type: notificationTypes.wigRequestUpdated,
      title: 'Wig request updated',
      message: wigRequest.notes || `Your wig request status is now ${wigRequest.status || 'pending'}.`,
      createdAt: wigRequest.updated_at || wigRequest.request_date,
      referenceType: 'wig_request',
      referenceId: wigRequest.id,
    }));
  }

  if (latestAllocation?.id) {
    const wig = latestAllocation.wigs;
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.wigAllocationUpdated}:${latestAllocation.id}`,
      type: notificationTypes.wigAllocationUpdated,
      title: 'Wig allocation updated',
      message: latestAllocation.notes
        || [wig?.wig_name, latestAllocation.release_status].filter(Boolean).join(' | ')
        || 'Your wig allocation has a new status update.',
      createdAt: latestAllocation.released_at || latestAllocation.allocated_at,
      referenceType: 'wig_allocation',
      referenceId: latestAllocation.id,
    }));
  }

  return notifications;
};

const persistMissingBackendNotifications = async ({
  databaseUserId,
  role,
  notifications,
  backendNotifications,
}) => {
  if (!databaseUserId) {
    return null;
  }

  const backendKeys = new Set(backendNotifications.map((item) => item.dedupeKey));
  const missingNotifications = notifications.filter((item) => !backendKeys.has(item.dedupeKey));

  if (!missingNotifications.length) {
    return null;
  }

  const result = await NotificationAPI.createNotifications(
    missingNotifications.map((notification) => toBackendPayload({ databaseUserId, role, notification }))
  );

  return result.error || null;
};

export const loadNotifications = async ({ userId, role }) => {
  try {
    const [localNotifications, databaseUserId, derivedNotifications] = await Promise.all([
      loadLocalNotifications({ userId, role }),
      resolveNotificationBackendUserId(userId),
      role === 'donor' ? buildDonorDerivedNotifications(userId) : buildPatientDerivedNotifications(userId),
    ]);

    const backendResult = databaseUserId
      ? await NotificationAPI.fetchNotificationsByUserId(databaseUserId).catch(() => ({ data: [], error: null }))
      : { data: [], error: null };

    const backendNotifications = (backendResult.data || [])
      .map(normalizeBackendNotification)
      .filter((notification) => notification.title || notification.message);

    const mergedNotifications = mergeNotifications({
      localNotifications,
      backendNotifications,
      derivedNotifications,
    });

    await saveLocalNotifications({ userId, role, notifications: mergedNotifications });
    await persistMissingBackendNotifications({
      databaseUserId,
      role,
      notifications: mergedNotifications,
      backendNotifications,
    });

    return {
      notifications: mergedNotifications,
      unreadCount: mergedNotifications.filter((item) => !item.isRead).length,
      error: null,
    };
  } catch (error) {
    const localNotifications = await loadLocalNotifications({ userId, role });

    return {
      notifications: localNotifications,
      unreadCount: localNotifications.filter((item) => !item.isRead).length,
      error: error.message || 'Unable to load notifications right now.',
    };
  }
};

export const recordNotifications = async ({ userId, role, notifications }) => {
  const localNotifications = await loadLocalNotifications({ userId, role });
  const databaseUserId = await resolveNotificationBackendUserId(userId);
  const mergedNotifications = mergeNotifications({
    localNotifications,
    backendNotifications: [],
    derivedNotifications: notifications,
  });

  await saveLocalNotifications({ userId, role, notifications: mergedNotifications });
  if (databaseUserId) {
    await NotificationAPI.createNotifications(
      notifications.map((notification) => toBackendPayload({ databaseUserId, role, notification }))
    ).catch(() => null);
  }

  return {
    notifications: mergedNotifications,
    unreadCount: mergedNotifications.filter((item) => !item.isRead).length,
  };
};

export const buildImmediateNotificationEvents = ({ role, payload }) => {
  if (role === 'donor') {
    const notifications = [];

    if (payload?.submission) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.submissionReceived}:${payload.submission.id}`,
        type: notificationTypes.submissionReceived,
        title: 'Submission received',
        message: `Your hair submission ${payload.submission.submission_code || ''} was saved successfully.`.trim(),
        createdAt: payload.submission.created_at || new Date().toISOString(),
        referenceType: 'hair_submission',
        referenceId: payload.submission.id,
      }));
    }

    if (payload?.screening) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.screeningCompleted}:${payload.screening.id || payload.submission?.id}`,
        type: notificationTypes.screeningCompleted,
        title: 'AI screening completed',
        message: payload.screening.summary || `Your screening result is ${payload.screening.decision || 'ready for review'}.`,
        createdAt: payload.screening.created_at || new Date().toISOString(),
        referenceType: 'ai_screening',
        referenceId: payload.screening.id || payload.submission?.id,
      }));
    }

    if (payload?.recommendations?.length) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.recommendationAvailable}:${payload.submission?.id}`,
        type: notificationTypes.recommendationAvailable,
        title: 'Recommendation available',
        message: payload.recommendations[0].recommendation_text || 'New donor guidance is now available.',
        createdAt: payload.recommendations[0].created_at || new Date().toISOString(),
        referenceType: 'hair_submission',
        referenceId: payload.submission?.id,
      }));
    }

    if (String(payload?.screening?.decision || '').toLowerCase().includes('eligible')) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.certificateAvailable}:${payload.submission?.id}`,
        type: notificationTypes.certificateAvailable,
        title: 'Certificate available',
        message: 'Your donation reached a qualified result and the donor certificate is now available.',
        createdAt: payload.screening?.created_at || new Date().toISOString(),
        referenceType: 'hair_submission',
        referenceId: payload.submission?.id,
      }));
    }

    return notifications;
  }

  if (role === 'patient' && payload?.wigRequest) {
    return [
      buildNotification({
        dedupeKey: `${notificationTypes.wigRequestUpdated}:${payload.wigRequest.id}`,
        type: notificationTypes.wigRequestUpdated,
        title: 'Wig request updated',
        message: payload.wigRequest.notes || `Your wig request status is ${payload.wigRequest.status || 'pending'}.`,
        createdAt: payload.wigRequest.updated_at || payload.wigRequest.request_date || new Date().toISOString(),
        referenceType: 'wig_request',
        referenceId: payload.wigRequest.id,
      }),
    ];
  }

  return [];
};

export const markNotificationRead = async ({ userId, role, notificationId }) => {
  const localNotifications = await loadLocalNotifications({ userId, role });
  const targetNotification = localNotifications.find((item) => (
    item.id === notificationId
      || item.backendId === notificationId
      || item.dedupeKey === notificationId
  ));
  const nextNotifications = localNotifications.map((item) => (
    item.id === notificationId
      || item.backendId === notificationId
      || item.dedupeKey === notificationId
      ? { ...item, isRead: true }
      : item
  ));

  await saveLocalNotifications({ userId, role, notifications: nextNotifications });

  if (targetNotification?.backendId) {
    await NotificationAPI.markNotificationsRead([targetNotification.backendId]).catch(() => null);
  }

  return {
    notifications: nextNotifications,
    unreadCount: nextNotifications.filter((item) => !item.isRead).length,
  };
};

export const markAllNotificationsRead = async ({ userId, role }) => {
  const localNotifications = await loadLocalNotifications({ userId, role });
  const databaseUserId = await resolveNotificationBackendUserId(userId);
  const nextNotifications = localNotifications.map((item) => ({
    ...item,
    isRead: true,
  }));

  await saveLocalNotifications({ userId, role, notifications: nextNotifications });
  if (databaseUserId) {
    await NotificationAPI.markAllNotificationsRead(databaseUserId).catch(() => null);
  }

  return {
    notifications: nextNotifications,
    unreadCount: 0,
  };
};

export const getNotificationTimestampLabel = (value) => formatReadableDate(value);
