import AsyncStorage from '@react-native-async-storage/async-storage';
import { invokeEdgeFunction } from '../api/supabase/client';
import * as NotificationAPI from './notification.api';
import { notificationStoragePrefix, notificationTypes } from './notification.constants';
import {
  fetchHairBundleTrackingHistory,
  fetchLatestDonationCertificateByUserId,
  fetchDonorRecommendationsBySubmissionId,
  fetchHairSubmissionLogisticsBySubmissionId,
  fetchHairSubmissionsByUserId,
} from './hairSubmission.api';
import { fetchRelevantDonationDriveUpdates } from './donorHome.api';
import {
  fetchLatestWigAllocationByPatientDetailsId,
  fetchLatestWigRequestByPatientDetailsId,
} from './wigRequest.api';
import { fetchPatientDetailsByUserId, resolveDatabaseUserId } from './profile/api/profile.api';
import { writeAuditLog } from '../utils/appErrors';

const buildStorageKey = ({ userId, role }) => `${notificationStoragePrefix}.${role}.${userId}`;
const DONOR_REMINDER_EMAIL_FUNCTION = 'send-donor-hair-analysis-reminder';
const DRIVE_NOTIFICATION_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const DRIVE_REMINDER_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const reminderEmailAttemptCache = new Map();

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

const toLocalDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNotificationRouteFromType = (notification) => {
  if (notification?.referenceType === 'route' && typeof notification?.referenceId === 'string') {
    return notification.referenceId;
  }

  if (notification?.referenceType === 'donation_drive' && notification?.referenceId) {
    return `/donor/drives/${notification.referenceId}`;
  }

  switch (notification?.type) {
    case notificationTypes.hairAnalysisReminder:
      return '/donor/donations';
    case notificationTypes.driveUpdated:
    case notificationTypes.driveRsvpReminder:
      return notification?.referenceId ? `/donor/drives/${notification.referenceId}` : '/donor/home';
    case notificationTypes.wigAllocationUpdated:
    case notificationTypes.wigRequestUpdated:
      return '/patient/requests';
    case notificationTypes.submissionReceived:
    case notificationTypes.screeningCompleted:
    case notificationTypes.recommendationAvailable:
    case notificationTypes.logisticsUpdated:
    case notificationTypes.donationTrackingUpdated:
    case notificationTypes.certificateAvailable:
      return '/donor/status';
    default:
      return null;
  }
};

const hasScreeningForLocalDay = (submissions = [], localDateKey) => (
  submissions.some((submission) => (
    (submission?.ai_screenings || []).some((screening) => (
      screening?.created_at && toLocalDateKey(screening.created_at) === localDateKey
    ))
  ))
);

const formatDriveWindowLabel = (drive) => {
  if (!drive?.start_date) return 'Schedule to be announced';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(drive.start_date));
  } catch {
    return drive.start_date;
  }
};

const shouldIncludeDriveUpdate = (drive) => {
  const now = Date.now();
  const updatedAt = drive?.updated_at ? new Date(drive.updated_at).getTime() : 0;
  const startsAt = drive?.start_date ? new Date(drive.start_date).getTime() : 0;
  const hasUpcomingReminderWindow = startsAt && startsAt >= now && startsAt - now <= DRIVE_REMINDER_WINDOW_MS;

  return hasUpcomingReminderWindow || (updatedAt && now - updatedAt <= DRIVE_NOTIFICATION_LOOKBACK_MS);
};

const buildDriveNotification = (drive) => {
  const organizationName = drive?.organization_name || 'your organization';
  const startsSoon = drive?.start_date
    ? (new Date(drive.start_date).getTime() - Date.now()) <= DRIVE_REMINDER_WINDOW_MS
    : false;

  if (drive?.registration?.registration_id && startsSoon) {
    return buildNotification({
      dedupeKey: `${notificationTypes.driveRsvpReminder}:${drive.donation_drive_id}`,
      type: notificationTypes.driveRsvpReminder,
      title: 'Drive reminder',
      message: `${drive.event_title || 'Donation drive'} starts ${formatDriveWindowLabel(drive)}.`,
      createdAt: drive.updated_at || drive.start_date || new Date().toISOString(),
      referenceType: 'donation_drive',
      referenceId: drive.donation_drive_id,
    });
  }

  return buildNotification({
    dedupeKey: `${notificationTypes.driveUpdated}:${drive.donation_drive_id}`,
    type: notificationTypes.driveUpdated,
    title: drive?.registration?.registration_id ? 'Drive update' : 'New donation drive available',
    message: drive?.registration?.registration_id
      ? `${drive.event_title || 'Donation drive'} from ${organizationName} has a new schedule or status update.`
      : `${organizationName} posted ${drive.event_title || 'a new donation drive'}.`,
    createdAt: drive.updated_at || drive.start_date || new Date().toISOString(),
    referenceType: 'donation_drive',
    referenceId: drive.donation_drive_id,
  });
};

const triggerHairAnalysisReminderEmail = async ({
  authUserId,
  databaseUserId,
  userEmail,
  localDateKey,
}) => {
  const cacheKey = `${databaseUserId || authUserId || 'anonymous'}:${localDateKey}`;
  if (reminderEmailAttemptCache.has(cacheKey)) {
    return reminderEmailAttemptCache.get(cacheKey);
  }

  const invokeResult = await invokeEdgeFunction(DONOR_REMINDER_EMAIL_FUNCTION, {
    body: {
      authUserId,
      databaseUserId,
      userEmail,
      localDate: localDateKey,
    },
  }).catch((error) => ({ data: null, error }));

  const normalizedResult = {
    sent: Boolean(invokeResult?.data?.sent),
    skipped: Boolean(invokeResult?.data?.skipped),
    reason: invokeResult?.data?.reason || '',
    error: invokeResult?.error || null,
  };

  if (normalizedResult.sent || normalizedResult.skipped) {
    reminderEmailAttemptCache.set(cacheKey, normalizedResult);
  }

  return normalizedResult;
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
  stableKey: [type || '', title || '', message || ''].join('::'),
  type,
  title,
  message,
  createdAt: formatDateTime(createdAt),
  referenceType: referenceType || null,
  referenceId: referenceId || null,
  isRead,
});

const normalizeTextToken = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const getNotificationIdentityKey = (notification = {}) => {
  const backendId = notification.backendId || notification.notificationId || null;
  if (backendId) {
    return `backend:${backendId}`;
  }

  if (notification.dedupeKey) {
    return `dedupe:${notification.dedupeKey}`;
  }

  const type = normalizeTextToken(notification.type || 'system_update');
  const referenceType = normalizeTextToken(notification.referenceType || 'none');
  const referenceId = String(notification.referenceId || notification.submissionId || notification.aiScreeningId || 'none').trim();
  const createdAt = String(notification.createdAt || notification.updatedAt || notification.created_at || '').trim();
  const title = normalizeTextToken(notification.title || 'system update');
  const message = normalizeTextToken(notification.message || '');

  return `fallback:${type}:${referenceType}:${referenceId}:${createdAt}:${title}:${message}`;
};

const sortNotificationsByNewest = (notifications = []) => (
  [...notifications].sort((left, right) => (
    new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
  ))
);

const dedupeNotifications = (notifications = []) => {
  const merged = new Map();

  (Array.isArray(notifications) ? notifications : []).forEach((notification) => {
    if (!notification || (!notification.title && !notification.message)) {
      return;
    }

    const identityKey = getNotificationIdentityKey(notification);
    const existing = merged.get(identityKey);

    if (!existing) {
      merged.set(identityKey, {
        ...notification,
        identityKey,
      });
      return;
    }

    const existingTime = new Date(existing.createdAt || 0).getTime();
    const incomingTime = new Date(notification.createdAt || 0).getTime();
    const preferIncoming = incomingTime >= existingTime;

    merged.set(identityKey, {
      ...(preferIncoming ? existing : notification),
      ...(preferIncoming ? notification : existing),
      id: notification.backendId || existing.backendId || notification.id || existing.id || identityKey,
      backendId: notification.backendId || existing.backendId || null,
      dedupeKey: notification.dedupeKey || existing.dedupeKey || identityKey,
      stableKey: notification.stableKey || existing.stableKey || identityKey,
      identityKey,
      isRead: Boolean(existing.isRead || notification.isRead),
      createdAt: preferIncoming ? (notification.createdAt || existing.createdAt) : (existing.createdAt || notification.createdAt),
      referenceType: existing.referenceType === 'notification'
        ? (notification.referenceType || existing.referenceType || null)
        : (existing.referenceType || notification.referenceType || null),
      referenceId: existing.referenceType === 'notification'
        ? (notification.referenceId || existing.referenceId || null)
        : (existing.referenceId || notification.referenceId || null),
    });
  });

  return sortNotificationsByNewest(Array.from(merged.values())).slice(0, 40);
};

const loadLocalNotifications = async ({ userId, role }) => {
  const rawValue = await AsyncStorage.getItem(buildStorageKey({ userId, role }));
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue);
    return dedupeNotifications(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
};

const saveLocalNotifications = async ({ userId, role, notifications }) => {
  await AsyncStorage.setItem(
    buildStorageKey({ userId, role }),
    JSON.stringify(dedupeNotifications(notifications))
  );
};

const normalizeBackendNotification = (row) => {
  const createdAt = row?.updated_at || new Date().toISOString();
  const type = row?.type || 'system_update';
  const backendId = row?.notification_id || null;
  const dedupeKey = `${type}:${backendId || `${row?.title || ''}:${row?.message || ''}:${createdAt}`}`;

  return buildNotification({
    dedupeKey,
    type,
    title: row?.title || 'System update',
    message: row?.message || '',
    createdAt,
    referenceType: 'notification',
    referenceId: backendId,
    backendId,
    isRead: String(row?.status || '').toLowerCase() === 'read',
  });
};

const toBackendPayload = ({ databaseUserId, role, notification }) => ({
  user_id: databaseUserId,
  title: notification.title,
  message: notification.message,
  type: notification.type || role || 'system_update',
  status: notification.isRead ? 'Read' : 'Unread',
  updated_at: notification.createdAt || new Date().toISOString(),
});

const resolveNotificationBackendUserId = async (userId) => {
  const result = await resolveDatabaseUserId(userId, { ensure: false });
  return result.data || null;
};

const fetchBackendNotifications = async (databaseUserId) => {
  if (!databaseUserId) {
    return {
      notifications: [],
      error: null,
    };
  }

  const backendResult = await NotificationAPI.fetchNotificationsByUserId(databaseUserId)
    .catch(() => ({ data: [], error: null }));

  return {
    notifications: (backendResult.data || [])
      .map(normalizeBackendNotification)
      .filter((notification) => notification.title || notification.message),
    error: backendResult.error || null,
  };
};

const mergeNotifications = ({ localNotifications, backendNotifications, derivedNotifications }) => {
  return dedupeNotifications([
    ...(backendNotifications || []),
    ...(localNotifications || []),
    ...(derivedNotifications || []),
  ]);
};

const buildDonorDerivedNotifications = async ({
  userId,
  databaseUserId = null,
  userEmail = '',
}) => {
  const notifications = [];
  const { data: submissions, error } = await fetchHairSubmissionsByUserId(userId, 6);

  if (error) {
    throw new Error(error.message || 'Unable to load donor notifications.');
  }
  const todayLocalDateKey = toLocalDateKey(new Date());

  if (!hasScreeningForLocalDay(submissions || [], todayLocalDateKey)) {
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.hairAnalysisReminder}:${todayLocalDateKey}`,
      type: notificationTypes.hairAnalysisReminder,
      title: 'Hair analysis reminder',
      message: 'You have not checked your hair today.',
      createdAt: new Date().toISOString(),
      referenceType: 'route',
      referenceId: '/donor/donations',
    }));

    if (databaseUserId || userId) {
      await triggerHairAnalysisReminderEmail({
        authUserId: userId,
        databaseUserId,
        userEmail,
        localDateKey: todayLocalDateKey,
      });
    }
  }

  await Promise.all((submissions || []).map(async (submission) => {
    const submissionId = submission?.submission_id;
    if (!submissionId) return;

    const screening = Array.isArray(submission?.ai_screenings)
      ? submission.ai_screenings[0]
      : submission?.ai_screenings;
    const screeningId = screening?.ai_screening_id;

    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.submissionReceived}:${submissionId}`,
      type: notificationTypes.submissionReceived,
      title: 'Donation submitted',
      message: `Your donation ${submission.submission_code || ''} was submitted and is now being processed.`.trim(),
      createdAt: submission.updated_at || submission.created_at,
      referenceType: 'hair_submission',
      referenceId: submissionId,
    }));

    if (screeningId) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.screeningCompleted}:${screeningId}`,
        type: notificationTypes.screeningCompleted,
        title: 'Hair analysis completed',
        message: screening.summary || `Your latest screening result is ${screening.decision || 'ready for review'}.`,
        createdAt: screening.created_at,
        referenceType: 'ai_screening',
        referenceId: screeningId,
      }));
    }

    const recommendationRows = submission?.donor_recommendations?.length
      ? submission.donor_recommendations
      : (await fetchDonorRecommendationsBySubmissionId(submissionId)).data || [];
    if (recommendationRows.length) {
      const topRecommendation = recommendationRows[0];
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.recommendationAvailable}:${submissionId}`,
        type: notificationTypes.recommendationAvailable,
        title: 'Recommendation available',
        message: topRecommendation.recommendation_text || 'New donor guidance is now available after screening.',
        createdAt: topRecommendation.created_at,
        referenceType: 'hair_submission',
        referenceId: submissionId,
      }));
    }

    const [logisticsResult, trackingResult] = await Promise.all([
      fetchHairSubmissionLogisticsBySubmissionId(submissionId),
      fetchHairBundleTrackingHistory({ submissionId, limit: 4 }),
    ]);

    const logistics = logisticsResult.data;
    if (logistics?.submission_logistics_id) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.logisticsUpdated}:${logistics.submission_logistics_id}`,
        type: notificationTypes.logisticsUpdated,
        title: 'Donation update',
        message: logistics.notes
          || [logistics.shipment_status, logistics.courier_name, logistics.tracking_number].filter(Boolean).join(' • ')
          || `Shipment status: ${logistics.shipment_status || logistics.logistics_type || 'updated'}.`,
        createdAt: logistics.updated_at || logistics.created_at,
        referenceType: 'hair_submission',
        referenceId: submissionId,
      }));
    }

    (trackingResult.data || []).forEach((entry) => {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.donationTrackingUpdated}:${entry.tracking_id}`,
        type: notificationTypes.donationTrackingUpdated,
        title: entry.title || 'Donation update',
        message: entry.description || `Donation status: ${entry.status || 'updated'}.`,
        createdAt: entry.updated_at,
        referenceType: 'hair_submission',
        referenceId: entry.submission_id || submissionId,
      }));
    });

    if (String(screening?.decision || '').toLowerCase().includes('eligible')) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.certificateAvailable}:${submissionId}:eligible`,
        type: notificationTypes.certificateAvailable,
        title: 'Certificate available',
        message: 'Your donation reached a qualified result and the donor certificate is now available.',
        createdAt: screening.created_at || submission.updated_at || submission.created_at,
        referenceType: 'hair_submission',
        referenceId: submissionId,
      }));
    }
  }));

  const latestCertificate = (await fetchLatestDonationCertificateByUserId(userId)).data;
  if (latestCertificate?.certificate_id) {
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.certificateAvailable}:${latestCertificate.certificate_id}`,
      type: notificationTypes.certificateAvailable,
      title: 'Certificate available',
      message: 'Your donor certificate is ready to view and share.',
      createdAt: latestCertificate.issued_at || new Date().toISOString(),
      referenceType: 'hair_submission',
      referenceId: latestCertificate.submission_id,
    }));
  }

  if (databaseUserId) {
    const driveUpdatesResult = await fetchRelevantDonationDriveUpdates({ databaseUserId, limit: 8 });
    (driveUpdatesResult.data || [])
      .filter(shouldIncludeDriveUpdate)
      .forEach((drive) => {
        notifications.push(buildDriveNotification(drive));
      });
  }

  return notifications;
};

const buildPatientDerivedNotifications = async (userId) => {
  const notifications = [];
  const { data: patientDetails, error: patientDetailsError } = await fetchPatientDetailsByUserId(userId);

  if (patientDetailsError) {
    throw new Error(patientDetailsError.message || 'Unable to load patient notifications.');
  }

  if (!patientDetails?.patient_id) {
    return notifications;
  }

  const [{ data: wigRequest }, { data: latestAllocation }] = await Promise.all([
    fetchLatestWigRequestByPatientDetailsId(patientDetails.patient_id),
    fetchLatestWigAllocationByPatientDetailsId(patientDetails.patient_id),
  ]);

  if (wigRequest?.req_id) {
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.wigRequestUpdated}:${wigRequest.req_id}`,
      type: notificationTypes.wigRequestUpdated,
      title: 'Wig request updated',
      message: wigRequest.notes || `Your wig request status is now ${wigRequest.status || 'pending'}.`,
      createdAt: wigRequest.updated_at || wigRequest.request_date,
      referenceType: 'wig_request',
      referenceId: wigRequest.req_id,
    }));
  }

  if (latestAllocation?.allocation_id) {
    const wig = latestAllocation.wigs;
    notifications.push(buildNotification({
      dedupeKey: `${notificationTypes.wigAllocationUpdated}:${latestAllocation.allocation_id}`,
      type: notificationTypes.wigAllocationUpdated,
      title: 'Wig allocation updated',
      message: latestAllocation.notes
        || [wig?.wig_name, latestAllocation.release_status].filter(Boolean).join(' | ')
        || 'Your wig allocation has a new status update.',
      createdAt: latestAllocation.released_at || latestAllocation.allocated_at,
      referenceType: 'wig_allocation',
      referenceId: latestAllocation.allocation_id,
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

  const backendKeys = new Set(backendNotifications.map((item) => item.stableKey || item.dedupeKey));
  const missingNotifications = notifications.filter((item) => !backendKeys.has(item.stableKey || item.dedupeKey));

  if (!missingNotifications.length) {
    return null;
  }

  const result = await NotificationAPI.createNotifications(
    missingNotifications.map((notification) => toBackendPayload({ databaseUserId, role, notification }))
  );

  return result.error || null;
};

export const loadNotificationSummary = async ({
  userId,
  userEmail = '',
  role,
  databaseUserId: preferredDatabaseUserId = null,
}) => {
  try {
    const [localNotifications, databaseUserId] = await Promise.all([
      loadLocalNotifications({ userId, role }),
      preferredDatabaseUserId
        ? Promise.resolve(preferredDatabaseUserId)
        : resolveNotificationBackendUserId(userId),
    ]);

    const derivedNotifications = role === 'donor'
      ? await buildDonorDerivedNotifications({
          userId,
          databaseUserId,
          userEmail,
        })
      : await buildPatientDerivedNotifications(userId);
    const backendResult = await fetchBackendNotifications(databaseUserId);
    const notifications = mergeNotifications({
      localNotifications,
      backendNotifications: backendResult.notifications,
      derivedNotifications,
    });

    if (notifications.length) {
      await saveLocalNotifications({ userId, role, notifications });
    }

    if (databaseUserId) {
      await persistMissingBackendNotifications({
        databaseUserId,
        role,
        notifications: derivedNotifications,
        backendNotifications: backendResult.notifications,
      });
    }

    return {
      notifications,
      unreadCount: notifications.filter((item) => !item.isRead).length,
      error: backendResult.error?.message || null,
      databaseUserId,
    };
  } catch (error) {
    const localNotifications = await loadLocalNotifications({ userId, role });

    return {
      notifications: localNotifications,
      unreadCount: localNotifications.filter((item) => !item.isRead).length,
      error: error.message || 'Unable to load notifications right now.',
      databaseUserId: preferredDatabaseUserId || null,
    };
  }
};

export const loadNotifications = ({
  userId,
  userEmail = '',
  role,
  databaseUserId: preferredDatabaseUserId = null,
}) => {
  return (async () => {
  try {
    const [localNotifications, databaseUserId] = await Promise.all([
      loadLocalNotifications({ userId, role }),
      preferredDatabaseUserId
        ? Promise.resolve(preferredDatabaseUserId)
        : resolveNotificationBackendUserId(userId),
    ]);
    const derivedNotifications = role === 'donor'
      ? await buildDonorDerivedNotifications({
          userId,
          databaseUserId,
          userEmail,
        })
      : await buildPatientDerivedNotifications(userId);

    const backendResult = await fetchBackendNotifications(databaseUserId);
    const backendNotifications = backendResult.notifications;

    const mergedNotifications = mergeNotifications({
      localNotifications,
      backendNotifications,
      derivedNotifications,
    });

    await saveLocalNotifications({ userId, role, notifications: mergedNotifications });

    if (databaseUserId) {
      const persistError = await persistMissingBackendNotifications({
        databaseUserId,
        role,
        notifications: derivedNotifications,
        backendNotifications,
      });

      if (!persistError && derivedNotifications.length) {
        const refreshedBackendResult = await NotificationAPI.fetchNotificationsByUserId(databaseUserId).catch(() => ({ data: [], error: null }));
        const refreshedBackendNotifications = (refreshedBackendResult.data || [])
          .map(normalizeBackendNotification)
          .filter((notification) => notification.title || notification.message);

        const databaseNotifications = mergeNotifications({
          localNotifications,
          backendNotifications: refreshedBackendNotifications,
          derivedNotifications,
        });

        await saveLocalNotifications({ userId, role, notifications: databaseNotifications });

        return {
          notifications: databaseNotifications,
          unreadCount: databaseNotifications.filter((item) => !item.isRead).length,
          error: null,
          databaseUserId,
        };
      }
    }

    return {
      notifications: mergedNotifications,
      unreadCount: mergedNotifications.filter((item) => !item.isRead).length,
      error: null,
      databaseUserId,
    };
  } catch (error) {
    const localNotifications = await loadLocalNotifications({ userId, role });

    return {
      notifications: localNotifications,
      unreadCount: localNotifications.filter((item) => !item.isRead).length,
      error: error.message || 'Unable to load notifications right now.',
      databaseUserId: preferredDatabaseUserId || null,
    };
  }
  })();
};

export const recordNotifications = async ({ userId, role, notifications }) => {
  const localNotifications = await loadLocalNotifications({ userId, role });
  const databaseUserId = await resolveNotificationBackendUserId(userId);
  let mergedNotifications = mergeNotifications({
    localNotifications,
    backendNotifications: [],
    derivedNotifications: notifications,
  });

  await saveLocalNotifications({ userId, role, notifications: mergedNotifications });

  if (databaseUserId) {
    const createResult = await NotificationAPI.createNotifications(
      notifications.map((notification) => toBackendPayload({ databaseUserId, role, notification }))
    ).catch((error) => ({ data: [], error }));

    if (!createResult?.error) {
      const backendNotifications = (createResult.data || [])
        .map(normalizeBackendNotification)
        .filter((notification) => notification.title || notification.message);

      mergedNotifications = mergeNotifications({
        localNotifications,
        backendNotifications,
        derivedNotifications: [],
      });

      await saveLocalNotifications({ userId, role, notifications: mergedNotifications });
      await writeAuditLog({
        authUserId: userId,
        databaseUserId,
        action: 'notification.create',
        description: `Created ${backendNotifications.length || notifications.length} notification record(s).`,
        resource: 'notification',
        status: 'success',
      });
    } else {
      await writeAuditLog({
        authUserId: userId,
        databaseUserId,
        action: 'notification.create',
        description: createResult.error?.message || 'Unable to persist notifications.',
        resource: 'notification',
        status: 'failed',
      });
    }
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
        dedupeKey: `${notificationTypes.submissionReceived}:${payload.submission.submission_id}`,
        type: notificationTypes.submissionReceived,
        title: 'Submission received',
        message: `Your hair submission ${payload.submission.submission_code || ''} was saved successfully.`.trim(),
        createdAt: payload.submission.created_at || new Date().toISOString(),
        referenceType: 'hair_submission',
        referenceId: payload.submission.submission_id,
      }));
    }

    if (payload?.screening) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.screeningCompleted}:${payload.screening.ai_screening_id || payload.submission?.submission_id}`,
        type: notificationTypes.screeningCompleted,
        title: 'AI screening completed',
        message: payload.screening.summary || `Your screening result is ${payload.screening.decision || 'ready for review'}.`,
        createdAt: payload.screening.created_at || new Date().toISOString(),
        referenceType: 'ai_screening',
        referenceId: payload.screening.ai_screening_id || payload.submission?.submission_id,
      }));
    }

    if (payload?.recommendations?.length) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.recommendationAvailable}:${payload.submission?.submission_id}`,
        type: notificationTypes.recommendationAvailable,
        title: 'Recommendation available',
        message: payload.recommendations[0].recommendation_text || 'New donor guidance is now available.',
        createdAt: payload.recommendations[0].created_at || new Date().toISOString(),
        referenceType: 'hair_submission',
        referenceId: payload.submission?.submission_id,
      }));
    }

    if (String(payload?.screening?.decision || '').toLowerCase().includes('eligible')) {
      notifications.push(buildNotification({
        dedupeKey: `${notificationTypes.certificateAvailable}:${payload.submission?.submission_id}`,
        type: notificationTypes.certificateAvailable,
        title: 'Certificate available',
        message: 'Your donation reached a qualified result and the donor certificate is now available.',
        createdAt: payload.screening?.created_at || new Date().toISOString(),
        referenceType: 'hair_submission',
        referenceId: payload.submission?.submission_id,
      }));
    }

    return notifications;
  }

  if (role === 'patient' && payload?.wigRequest) {
    return [
      buildNotification({
        dedupeKey: `${notificationTypes.wigRequestUpdated}:${payload.wigRequest.req_id}`,
        type: notificationTypes.wigRequestUpdated,
        title: 'Wig request updated',
        message: payload.wigRequest.notes || `Your wig request status is ${payload.wigRequest.status || 'pending'}.`,
        createdAt: payload.wigRequest.updated_at || payload.wigRequest.request_date || new Date().toISOString(),
        referenceType: 'wig_request',
        referenceId: payload.wigRequest.req_id,
      }),
    ];
  }

  return [];
};

export const markNotificationRead = async ({ userId, role, notificationId }) => {
  const localNotifications = await loadLocalNotifications({ userId, role });
  const databaseUserId = await resolveNotificationBackendUserId(userId);
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
    const result = await NotificationAPI.markNotificationsRead([targetNotification.backendId]).catch((error) => ({ error }));
    await writeAuditLog({
      authUserId: userId,
      databaseUserId,
      action: 'notification.read',
      description: result?.error
        ? (result.error.message || 'Unable to mark notification as read.')
        : `Marked notification ${targetNotification.backendId} as read.`,
      resource: 'notification',
      status: result?.error ? 'failed' : 'success',
    });
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
    const result = await NotificationAPI.markAllNotificationsRead(databaseUserId).catch((error) => ({ error }));
    await writeAuditLog({
      authUserId: userId,
      databaseUserId,
      action: 'notification.read_all',
      description: result?.error
        ? (result.error.message || 'Unable to mark all notifications as read.')
        : 'Marked all notifications as read.',
      resource: 'notification',
      status: result?.error ? 'failed' : 'success',
    });
  }

  return {
    notifications: nextNotifications,
    unreadCount: 0,
  };
};

export const getNotificationNavigationTarget = (notification) => (
  getNotificationRouteFromType(notification)
);

export const getNotificationTimestampLabel = (value) => formatReadableDate(value);
