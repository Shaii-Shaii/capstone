import {
  fetchHairBundleTrackingHistory,
  fetchHairSubmissionLogisticsBySubmissionId,
  fetchLatestHairSubmissionByUserId,
  fetchLatestHairSubmissionDetailBySubmissionId,
  fetchLatestQaAssessmentBySubmissionDetailId,
} from './hairSubmission.api';
import {
  fetchLatestWigAllocationByPatientDetailsId,
  fetchLatestWigRequestByPatientDetailsId,
} from './wigRequest.api';
import { fetchPatientDetailsByUserId } from './profile/api/profile.api';

const normalizeStatusLabel = (value, fallback = 'Pending') => {
  if (!value) return fallback;
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatDateTime = (value) => {
  if (!value) return '';

  try {
    return new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const getToneFromStatus = (value = '') => {
  const normalized = value.toLowerCase();

  if (['approved', 'eligible', 'completed', 'released', 'received', 'ready'].some((token) => normalized.includes(token))) {
    return 'success';
  }

  if (['failed', 'rejected', 'cancelled', 'error'].some((token) => normalized.includes(token))) {
    return 'error';
  }

  return 'info';
};

const getStepState = ({ index, currentIndex, highlightedIndex = null, hasData = true }) => {
  if (!hasData) return 'upcoming';
  if (highlightedIndex === index) return 'attention';
  if (index < currentIndex) return 'completed';
  if (index === currentIndex) return 'current';
  return 'upcoming';
};

const buildDonorTracker = ({ submission, detail, logistics, qaAssessment, history }) => {
  if (!submission?.id) {
    return {
      tracker: null,
      error: null,
    };
  }

  const latestHistory = history?.[0] || null;
  const latestStatus = latestHistory?.status
    || qaAssessment?.assessment_result
    || logistics?.shipment_status
    || detail?.status
    || submission?.status;

  const qaNeedsAttention = ['failed', 'rejected'].some((token) =>
    String(qaAssessment?.assessment_result || '').toLowerCase().includes(token)
  );

  const currentIndex = latestHistory
    ? 3
    : qaAssessment
      ? 2
      : logistics
        ? 1
        : 0;

  const steps = [
    {
      key: 'submission',
      title: 'Submission received',
      label: normalizeStatusLabel(submission.status, 'Submitted'),
      description: `Hair submission ${submission.submission_code || 'record'} was created on ${formatDateTime(submission.created_at)}.`,
      state: getStepState({ index: 0, currentIndex, hasData: Boolean(submission) }),
    },
    {
      key: 'logistics',
      title: 'Logistics and transport',
      label: normalizeStatusLabel(logistics?.shipment_status || logistics?.logistics_type, 'Waiting for logistics'),
      description: logistics
        ? [logistics.courier_name, logistics.tracking_number].filter(Boolean).join(' • ')
          || logistics.notes
          || 'Transport details were added to this submission.'
        : 'Pickup, courier, or drop-off details will appear here once logistics is scheduled.',
      state: getStepState({ index: 1, currentIndex, hasData: Boolean(logistics) }),
    },
    {
      key: 'qa',
      title: 'Quality assessment',
      label: normalizeStatusLabel(qaAssessment?.assessment_result || detail?.status, 'Pending review'),
      description: qaAssessment?.remarks
        || detail?.detail_notes
        || 'The bundle will move here once assessment starts.',
      state: getStepState({
        index: 2,
        currentIndex,
        highlightedIndex: qaNeedsAttention ? 2 : null,
        hasData: Boolean(qaAssessment),
      }),
    },
    {
      key: 'tracking',
      title: 'Bundle tracking',
      label: normalizeStatusLabel(latestHistory?.status, 'Waiting for tracking updates'),
      description: latestHistory?.description
        || latestHistory?.title
        || 'The latest bundle movement will appear here after QA and logistics updates.',
      state: getStepState({ index: 3, currentIndex, hasData: Boolean(latestHistory) }),
    },
  ];

  const events = [
    {
      key: `submission-${submission.id}`,
      title: 'Hair submission created',
      description: `Submission code ${submission.submission_code || 'not available'}`,
      timestamp: formatDateTime(submission.created_at),
      badge: normalizeStatusLabel(submission.status, 'Submitted'),
    },
    logistics
      ? {
          key: `logistics-${logistics.id}`,
          title: logistics.logistics_type
            ? `${normalizeStatusLabel(logistics.logistics_type)} arranged`
            : 'Logistics updated',
          description: logistics.notes
            || [logistics.courier_name, logistics.tracking_number].filter(Boolean).join(' • ')
            || 'Transport details were added for this donation.',
          timestamp: formatDateTime(
            logistics.received_at
            || logistics.pickup_schedule_at
            || logistics.pickup_schedule_date
            || logistics.updated_at
          ),
          badge: normalizeStatusLabel(logistics.shipment_status || logistics.logistics_type, 'In transit'),
        }
      : null,
    qaAssessment
      ? {
          key: `qa-${qaAssessment.id}`,
          title: 'Quality assessment updated',
          description: qaAssessment.remarks || 'The QA result is now available for this bundle.',
          timestamp: formatDateTime(qaAssessment.assessed_at),
          badge: normalizeStatusLabel(qaAssessment.assessment_result, 'Reviewed'),
        }
      : null,
    ...(history || []).map((entry) => ({
      key: `history-${entry.id}`,
      title: entry.title || 'Bundle update',
      description: entry.description || 'A bundle tracking update was recorded.',
      timestamp: formatDateTime(entry.updated_at),
      badge: normalizeStatusLabel(entry.status, 'Updated'),
    })),
  ].filter(Boolean);

  return {
    tracker: {
      title: 'Donation Status',
      subtitle: 'Track the latest donation progress from submission to bundle handling.',
      emptyTitle: 'No donation tracking yet',
      emptyDescription: 'Your latest hair submission will appear here after you save it.',
      summary: {
        label: normalizeStatusLabel(latestStatus, 'Submitted'),
        tone: getToneFromStatus(latestStatus || ''),
        referenceLabel: 'Submission code',
        referenceValue: submission.submission_code || 'Not available',
        helperText: `Last updated ${formatDateTime(
          latestHistory?.updated_at
          || qaAssessment?.assessed_at
          || logistics?.updated_at
          || submission.updated_at
          || submission.created_at
        )}`,
      },
      steps,
      events,
      watch: {
        submissionId: submission.id,
        submissionDetailId: detail?.id || null,
      },
    },
    error: null,
  };
};

const buildPatientTracker = ({ patientDetails, wigRequest, latestAllocation }) => {
  if (!patientDetails?.id) {
    return {
      tracker: null,
      error: null,
    };
  }

  const wig = latestAllocation?.wigs || null;
  const releaseStatus = latestAllocation?.release_status || '';
  const currentStatus = releaseStatus || wig?.wig_status || wigRequest?.status || '';

  const currentIndex = latestAllocation?.released_at || releaseStatus
    ? 3
    : wig?.id || latestAllocation?.id
      ? 2
      : wigRequest?.id
        ? 1
        : 0;

  const steps = [
    {
      key: 'request',
      title: 'Request placed',
      label: normalizeStatusLabel(wigRequest?.status, 'Waiting for request'),
      description: wigRequest?.request_date
        ? `Request date ${formatDateTime(wigRequest.request_date)}`
        : 'Your wig request will appear here after submission.',
      state: getStepState({ index: 0, currentIndex, hasData: Boolean(wigRequest) }),
    },
    {
      key: 'review',
      title: 'Preference review',
      label: normalizeStatusLabel(wigRequest?.status, 'Pending review'),
      description: wigRequest?.notes
        || 'The patient request and wig specifications are under review.',
      state: getStepState({ index: 1, currentIndex, hasData: Boolean(wigRequest) }),
    },
    {
      key: 'production',
      title: 'Wig production',
      label: normalizeStatusLabel(wig?.wig_status, 'Waiting for wig assignment'),
      description: wig?.wig_name
        ? `${wig.wig_name}${wig.wig_code ? ` • ${wig.wig_code}` : ''}`
        : 'A production update appears here once a wig record is linked to your request.',
      state: getStepState({ index: 2, currentIndex, hasData: Boolean(wig?.id || latestAllocation?.id) }),
    },
    {
      key: 'allocation',
      title: 'Allocation and release',
      label: normalizeStatusLabel(releaseStatus, 'Not allocated yet'),
      description: latestAllocation?.notes
        || (latestAllocation?.allocated_at
          ? `Allocated on ${formatDateTime(latestAllocation.allocated_at)}`
          : 'Allocation and release updates will appear here.'),
      state: getStepState({ index: 3, currentIndex, hasData: Boolean(latestAllocation?.id) }),
    },
  ];

  const events = [
    wigRequest
      ? {
          key: `wig-request-${wigRequest.id}`,
          title: 'Wig request submitted',
          description: wigRequest.notes || 'Your wig preferences were saved to the request.',
          timestamp: formatDateTime(wigRequest.updated_at || wigRequest.request_date),
          badge: normalizeStatusLabel(wigRequest.status, 'Pending'),
        }
      : null,
    wig
      ? {
          key: `wig-${wig.id}`,
          title: 'Wig record updated',
          description: wig.wig_name || 'A wig was linked to your request.',
          timestamp: formatDateTime(wig.completed_at || wig.updated_at),
          badge: normalizeStatusLabel(wig.wig_status, 'In progress'),
        }
      : null,
    latestAllocation
      ? {
          key: `allocation-${latestAllocation.id}`,
          title: latestAllocation.released_at ? 'Wig released' : 'Wig allocated',
          description: latestAllocation.notes || 'Allocation details were updated for your request.',
          timestamp: formatDateTime(latestAllocation.released_at || latestAllocation.allocated_at),
          badge: normalizeStatusLabel(releaseStatus || 'Allocated', 'Allocated'),
        }
      : null,
  ].filter(Boolean);

  return {
    tracker: {
      title: 'Wig Request Status',
      subtitle: 'Follow your wig request from patient intake to allocation and release.',
      emptyTitle: 'No wig tracking yet',
      emptyDescription: 'Your wig request status will appear here after the first request is saved.',
      summary: {
        label: normalizeStatusLabel(currentStatus, 'Waiting for request'),
        tone: getToneFromStatus(currentStatus || ''),
        referenceLabel: 'Patient code',
        referenceValue: patientDetails.patient_code || 'Not assigned',
        helperText: latestAllocation?.allocated_at
          ? `Latest allocation ${formatDateTime(latestAllocation.allocated_at)}`
          : wigRequest?.request_date
            ? `Request date ${formatDateTime(wigRequest.request_date)}`
            : 'Waiting for the first wig request.',
      },
      steps,
      events,
      watch: {
        patientId: patientDetails.id,
        reqId: wigRequest?.id || null,
        wigId: wig?.id || null,
      },
    },
    error: null,
  };
};

export const getProcessTracking = async ({ role, userId }) => {
  try {
    if (!userId) {
      throw new Error('Your session is not ready.');
    }

    if (role === 'donor') {
      const { data: submission, error: submissionError } = await fetchLatestHairSubmissionByUserId(userId);
      if (submissionError) {
        throw new Error(submissionError.message || 'Unable to load donor tracking.');
      }

      if (!submission?.id) {
        return { tracker: null, error: null };
      }

      const { data: detail, error: detailError } = await fetchLatestHairSubmissionDetailBySubmissionId(submission.id);
      if (detailError) {
        throw new Error(detailError.message || 'Unable to load donor tracking details.');
      }

      const [{ data: logistics, error: logisticsError }, { data: qaAssessment, error: qaError }, { data: history, error: historyError }] =
        await Promise.all([
          fetchHairSubmissionLogisticsBySubmissionId(submission.id),
          detail?.id ? fetchLatestQaAssessmentBySubmissionDetailId(detail.id) : Promise.resolve({ data: null, error: null }),
          fetchHairBundleTrackingHistory({ submissionId: submission.id, submissionDetailId: detail?.id }),
        ]);

      if (logisticsError) throw new Error(logisticsError.message || 'Unable to load logistics updates.');
      if (qaError) throw new Error(qaError.message || 'Unable to load QA updates.');
      if (historyError) throw new Error(historyError.message || 'Unable to load bundle tracking history.');

      return buildDonorTracker({
        submission,
        detail,
        logistics,
        qaAssessment,
        history: history || [],
      });
    }

    if (role === 'patient') {
      const { data: patientDetails, error: patientDetailsError } = await fetchPatientDetailsByUserId(userId);
      if (patientDetailsError) {
        throw new Error(patientDetailsError.message || 'Unable to load patient details.');
      }

      if (!patientDetails?.id) {
        return { tracker: null, error: null };
      }

      const [{ data: wigRequest, error: wigRequestError }, { data: latestAllocation, error: allocationError }] =
        await Promise.all([
          fetchLatestWigRequestByPatientDetailsId(patientDetails.id),
          fetchLatestWigAllocationByPatientDetailsId(patientDetails.id),
        ]);

      if (wigRequestError) throw new Error(wigRequestError.message || 'Unable to load wig request tracking.');
      if (allocationError) throw new Error(allocationError.message || 'Unable to load wig allocation tracking.');

      return buildPatientTracker({
        patientDetails,
        wigRequest,
        latestAllocation,
      });
    }

    return { tracker: null, error: null };
  } catch (error) {
    return {
      tracker: null,
      error: error.message || 'Unable to load process tracking.',
    };
  }
};
