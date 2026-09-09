import {
  fetchHairSubmissionLogisticsBySubmissionId,
  fetchLatestHairSubmissionByUserId,
  fetchLatestHairSubmissionDetailBySubmissionId,
} from './hairSubmission.api';
import {
  fetchLatestWigAllocationTrackingByPatientId,
  fetchPatientWigRequestsByPatientId,
  fetchPatientWigReleaseAppeal,
  fetchWigReleaseReceiptsByRequestIds,
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

const normalizeTrackingStatusKey = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ');

// eslint-disable-next-line no-unused-vars
const buildLegacyDonorTracker = ({ submission, detail, logistics, qaAssessment = null, history = [] }) => {
  if (!submission?.submission_id) {
    return {
      tracker: null,
      error: null,
    };
  }

  const latestStatus = logistics?.shipment_status
    || detail?.status
    || submission?.status;

  const latestHistory = history?.[0] || null;
  const qaNeedsAttention = ['failed', 'rejected'].some((token) =>
    String(qaAssessment?.assessment_result || '').toLowerCase().includes(token)
  );

  const normalizedSubmissionStatus = String(submission?.status || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  const hasWigStage = [
    'wig in production',
    'wiginproduction',
    'wig created',
    'wigcreated',
  ].some((token) => normalizedSubmissionStatus.includes(token));
  const currentIndex = hasWigStage ? 3 : logistics ? 2 : detail ? 1 : 0;

  const steps = [
    {
      key: 'submission',
      title: 'Submission received',
      label: normalizeStatusLabel(submission.status, 'Submitted'),
      description: `Hair submission ${submission.donation_reference || 'record'} was created on ${formatDateTime(submission.created_at)}.`,
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
        : 'Courier or walk-in drop-off details will appear here once logistics is confirmed.',
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
      key: `submission-${submission.submission_id}`,
      title: 'Hair submission created',
      description: `Donation reference ${submission.donation_reference || 'not available'}`,
      timestamp: formatDateTime(submission.created_at),
      badge: normalizeStatusLabel(submission.status, 'Submitted'),
    },
    logistics
      ? {
          key: `logistics-${logistics.submission_logistics_id}`,
          title: logistics.logistics_type
            ? `${normalizeStatusLabel(logistics.logistics_type)} arranged`
            : 'Logistics updated',
          description: logistics.notes
            || [logistics.courier_name, logistics.tracking_number].filter(Boolean).join(' • ')
            || 'Transport details were added for this donation.',
          timestamp: formatDateTime(
            logistics.received_at
            || logistics.pickup_approved_at
            || logistics.pickup_scheduled_at
            || logistics.created_at
          ),
          badge: normalizeStatusLabel(logistics.shipment_status || logistics.logistics_type, 'In transit'),
        }
      : null,
    qaAssessment
      ? {
          key: `qa-${qaAssessment.qa_assessment_id}`,
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
        referenceLabel: 'Donation reference',
        referenceValue: submission.donation_reference || 'Not available',
        helperText: `Last updated ${formatDateTime(
          latestHistory?.updated_at
          || qaAssessment?.assessed_at
          || logistics?.received_at
          || logistics?.pickup_approved_at
          || logistics?.pickup_scheduled_at
          || logistics?.created_at
          || submission.updated_at
          || submission.created_at
        )}`,
      },
      steps,
      events,
      watch: {
        submissionId: submission.submission_id,
        submissionDetailId: detail?.submission_detail_id || null,
      },
    },
    error: null,
  };
};

const buildDonorTracker = ({ submission, detail, logistics }) => {
  if (!submission?.submission_id) {
    return {
      tracker: null,
      error: null,
    };
  }

  const normalizedSubmissionStatus = String(submission?.status || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
  const hasWigStage = [
    'wig in production',
    'wiginproduction',
    'wig created',
    'wigcreated',
  ].some((token) => normalizedSubmissionStatus.includes(token));
  const detailNeedsAttention = ['failed', 'rejected'].some((token) =>
    String(detail?.status || '').toLowerCase().includes(token)
  );
  const latestStatus = logistics?.shipment_status || detail?.status || submission?.status;
  const currentIndex = hasWigStage ? 3 : logistics ? 2 : detail ? 1 : 0;

  const steps = [
    {
      key: 'submission',
      title: 'Submission received',
      label: normalizeStatusLabel(submission.status, 'Submitted'),
      description: `Hair submission ${submission.donation_reference || 'record'} was created on ${formatDateTime(submission.created_at)}.`,
      state: getStepState({ index: 0, currentIndex, hasData: Boolean(submission) }),
    },
    {
      key: 'details',
      title: 'Donation details reviewed',
      label: normalizeStatusLabel(detail?.status, 'Pending review'),
      description: detail?.detail_notes || detail?.rejection_reason || 'Hair details will update after staff review.',
      state: getStepState({
        index: 1,
        currentIndex,
        highlightedIndex: detailNeedsAttention ? 1 : null,
        hasData: Boolean(detail),
      }),
    },
    {
      key: 'logistics',
      title: 'Logistics and transport',
      label: normalizeStatusLabel(logistics?.shipment_status || logistics?.logistics_type, 'Waiting for logistics'),
      description: logistics?.notes || 'Courier or walk-in drop-off details will appear here once logistics is confirmed.',
      state: getStepState({ index: 2, currentIndex, hasData: Boolean(logistics) }),
    },
    {
      key: 'wig-stage',
      title: 'Wig production',
      label: normalizeStatusLabel(submission?.status, 'Waiting for production'),
      description: hasWigStage
        ? 'The donation has moved into the wig production stage.'
        : 'This step updates when staff moves the donation into wig production.',
      state: getStepState({ index: 3, currentIndex, hasData: hasWigStage }),
    },
  ];

  const events = [
    {
      key: `submission-${submission.submission_id}`,
      title: 'Hair submission created',
      description: `Donation reference ${submission.donation_reference || 'not available'}`,
      timestamp: formatDateTime(submission.created_at),
      badge: normalizeStatusLabel(submission.status, 'Submitted'),
    },
    detail
      ? {
          key: `detail-${detail.submission_detail_id}`,
          title: 'Donation details updated',
          description: detail.detail_notes || detail.rejection_reason || 'Hair submission details were reviewed.',
          timestamp: formatDateTime(detail.updated_at || detail.created_at),
          badge: normalizeStatusLabel(detail.status, 'Reviewed'),
        }
      : null,
    logistics
      ? {
          key: `logistics-${logistics.submission_logistics_id}`,
          title: logistics.logistics_type
            ? `${normalizeStatusLabel(logistics.logistics_type)} arranged`
            : 'Logistics updated',
          description: logistics.notes || 'Transport details were added for this donation.',
          timestamp: formatDateTime(logistics.received_at || logistics.created_at),
          badge: normalizeStatusLabel(logistics.shipment_status || logistics.logistics_type, 'In transit'),
        }
      : null,
  ].filter(Boolean);

  return {
    tracker: {
      title: 'Donation Status',
      subtitle: 'Track the latest donation progress from submission to staff scanning updates.',
      emptyTitle: 'No donation tracking yet',
      emptyDescription: 'Your latest hair submission will appear here after you save it.',
      summary: {
        label: normalizeStatusLabel(latestStatus, 'Submitted'),
        tone: getToneFromStatus(latestStatus || ''),
        referenceLabel: 'Donation reference',
        referenceValue: submission.donation_reference || 'Not available',
        helperText: `Last updated ${formatDateTime(
          logistics?.received_at
          || logistics?.created_at
          || detail?.updated_at
          || submission.updated_at
          || submission.created_at
        )}`,
      },
      steps,
      events,
      watch: {
        submissionId: submission.submission_id,
        submissionDetailId: detail?.submission_detail_id || null,
      },
    },
    error: null,
  };
};

const buildPatientAppealTimelineSteps = (appeal, wigRequest) => {
  const appealStatus = normalizeTrackingStatusKey(appeal?.status);
  const returnStatus = normalizeTrackingStatusKey(appeal?.return_status);
  const isApproved = appealStatus === 'approved for replacement';
  const isRejected = appealStatus === 'rejected';
  const returnRanks = {
    'awaiting return': 1,
    'in transit': 2,
    'return received': 3,
    'under repair': 4,
    'ready for re release': 5,
    'return completed': 6,
    completed: 6,
  };
  const returnRank = returnRanks[returnStatus] || 0;
  const returnStepState = (rank) => returnRank > rank ? 'completed' : returnRank === rank ? 'current' : 'pending';
  const steps = [
    {
      key: 'problem-reported', title: 'Problem Reported', label: 'Submitted',
      description: formatDateTime(appeal?.submitted_at), state: 'completed',
    },
    {
      key: 'appeal-review', title: 'Appeal Under Review',
      label: appealStatus === 'pending staff review' ? 'In review' : 'Reviewed',
      description: appealStatus === 'pending staff review' ? 'Staff is reviewing your report.' : formatDateTime(appeal?.reviewed_at),
      state: appealStatus === 'pending staff review' ? 'current' : 'completed',
    },
  ];
  if (isRejected) {
    steps.push({
      key: 'appeal-rejected', title: 'Appeal Rejected', label: 'Rejected',
      description: appeal?.decision_note || 'Staff completed the appeal review.', state: 'attention',
    });
  }
  if (isApproved) {
    steps.push({
      key: 'appeal-approved', title: 'Appeal Approved', label: appeal?.requested_resolution || 'Approved',
      description: appeal?.decision_note || 'Follow the return instructions provided by staff.', state: returnRank ? 'completed' : 'current',
    });
    steps.push(
      { key: 'awaiting-return', title: 'Awaiting Wig Return', label: returnRank >= 1 ? 'Ready' : 'Waiting', description: appeal?.return_note || '', state: returnStepState(1) },
      { key: 'return-transit', title: 'Return In Transit', label: returnRank >= 2 ? 'In transit' : 'Waiting', description: appeal?.return_tracking_number || formatDateTime(appeal?.return_shipped_at), state: returnStepState(2) },
      { key: 'return-received', title: 'Return Received', label: returnRank >= 3 ? 'Received' : 'Waiting', description: formatDateTime(appeal?.return_received_at), state: returnStepState(3) },
    );
    if (appeal?.requested_resolution === 'Repair or Replace') {
      steps.push(
        { key: 'under-repair', title: 'Under Repair or Replacement', label: returnRank >= 4 ? 'In progress' : 'Waiting', description: formatDateTime(appeal?.repair_started_at), state: returnStepState(4) },
        { key: 'ready-rerelease', title: 'Ready for Re-release', label: returnRank >= 5 ? 'Ready' : 'Waiting', description: formatDateTime(appeal?.repair_completed_at), state: returnStepState(5) },
      );
    } else {
      steps.push({
        key: 'request-closed', title: 'Request Closed', label: normalizeTrackingStatusKey(wigRequest?.status) === 'returned completed' ? 'Closed' : 'Waiting',
        description: 'The request closes after the returned wig is received.', state: normalizeTrackingStatusKey(wigRequest?.status) === 'returned completed' ? 'completed' : returnStepState(6),
      });
    }
  }
  return steps;
};

const buildPatientTracker = ({ patientDetails, wigRequest, latestAllocation, releaseReceipt, releaseAppeal }) => {
  if (!patientDetails?.patient_id) {
    return {
      tracker: null,
      error: null,
    };
  }

  const wig = latestAllocation?.wigs || null;
  const releaseStatus = latestAllocation?.release_status || '';
  const requestStatus = normalizeTrackingStatusKey(wigRequest?.status);
  const fulfillmentStatus = normalizeTrackingStatusKey(wigRequest?.fulfillment_status);
  const wigStatus = normalizeTrackingStatusKey(wig?.wig_status);
  const normalizedReleaseStatus = normalizeTrackingStatusKey(releaseStatus);
  const hasReleased = Boolean(releaseReceipt?.released_at || ['released', 'appealed', 'returned completed'].includes(requestStatus));
  const hasConfirmedReceipt = Boolean(releaseReceipt?.received_confirmed_at);
  const currentStatus = wigRequest?.status || wigRequest?.fulfillment_status || releaseStatus || wig?.wig_status || '';
  const isRequestStopped = ['rejected', 'cancelled', 'canceled', 'closed'].includes(requestStatus);
  const expectedReleaseAt = wigRequest?.expected_release_at || null;
  const expectedReleaseUpdatedAt = wigRequest?.expected_release_updated_at || null;
  const expectedWasUpdatedAfterLatestRelease = Boolean(
    releaseReceipt?.released_at
    && expectedReleaseUpdatedAt
    && new Date(expectedReleaseUpdatedAt).getTime() > new Date(releaseReceipt.released_at).getTime()
  );
  const showActiveExpectedRelease = Boolean(
    expectedReleaseAt
    && !isRequestStopped
    && (!hasReleased || expectedWasUpdatedAfterLatestRelease)
  );
  const expectedReleaseHasPassed = Boolean(
    showActiveExpectedRelease
    && new Date(expectedReleaseAt).getTime() < Date.now()
  );
  const isApproved = Boolean(
    wigRequest?.approved_at
    || requestStatus.startsWith('accepted')
    || ['approved', 'preparing', 'production', 'ready', 'release', 'released'].some((token) => requestStatus.includes(token))
  );
  const hasActiveRequest = Boolean(
    wigRequest?.req_id
    && !['completed', 'claimed', 'released', 'cancelled', 'canceled', 'rejected', 'closed']
      .some((token) => requestStatus.includes(token))
  );
  const hasAllocation = Boolean(
    latestAllocation?.allocation_id
    || wigRequest?.allocated_wig_id
    || requestStatus.includes('wig allocated')
    || ['allocated', 'bundle matched', 'wig matched'].some((token) => fulfillmentStatus.includes(token))
  );
  const hasWig = Boolean(wig?.wig_id || wig?.id || wigRequest?.allocated_wig_id);
  const isInProduction = Boolean(
    requestStatus.includes('production')
    || requestStatus.includes('preparing')
    || fulfillmentStatus.includes('production')
    || fulfillmentStatus.includes('preparing')
    || wigStatus.includes('production')
    || wigStatus.includes('preparing')
  );
  const isSentToHospital = Boolean(
    latestAllocation?.released_at
    || ['to be release', 'releasing', 'ready for pick up'].includes(requestStatus)
    || ['sent', 'transit', 'releasing', 'released', 'delivered'].some((token) => normalizedReleaseStatus.includes(token))
    || ['distribution', 'dispatch', 'in transit', 'ready for pick up'].some((token) => fulfillmentStatus.includes(token))
  );
  const isReadyForClaiming = Boolean(
    requestStatus === 'released'
    || ['ready', 'claim', 'received', 'completed', 'delivered'].some((token) => normalizedReleaseStatus.includes(token))
    || ['released', 'received', 'completed', 'delivered'].some((token) => fulfillmentStatus.includes(token))
  );

  const currentIndex = isReadyForClaiming
    ? 5
    : isSentToHospital
      ? 4
      : hasWig || isInProduction || wigStatus.includes('progress')
        ? 3
        : hasAllocation
          ? 2
          : isApproved || wigRequest?.req_id
            ? 1
            : 0;

  const steps = [
    {
      key: 'request-submitted',
      title: 'Request submitted',
      label: wigRequest?.req_id ? 'Submitted' : 'Waiting for request',
      description: wigRequest?.request_date
        ? `Request date ${formatDateTime(wigRequest.request_date)}`
        : 'Your wig request will appear here after submission.',
      state: getStepState({ index: 0, currentIndex, hasData: Boolean(wigRequest) }),
    },
    {
      key: 'approval',
      title: isApproved ? 'Request approved' : 'Waiting for approval',
      label: normalizeStatusLabel(wigRequest?.status, 'Pending approval'),
      description: isApproved
        ? `Approved ${formatDateTime(wigRequest?.approved_at || wigRequest?.updated_at)}`
        : 'The organization will review your wig request.',
      state: getStepState({ index: 1, currentIndex, hasData: Boolean(wigRequest) }),
    },
    {
      key: 'donor-match',
      title: 'Looking for wig donor',
      label: hasAllocation ? 'Donor bundle matched' : 'Matching in progress',
      description: wig?.wig_name
        ? `${wig.wig_name}${wig.wig_code ? ` • ${wig.wig_code}` : ''}`
        : 'A matching update appears here once a wig is linked to your request.',
      state: getStepState({ index: 2, currentIndex, hasData: hasAllocation }),
    },
    {
      key: 'preparing',
      title: 'Preparing wig',
      label: normalizeStatusLabel(wig?.wig_status, hasWig ? 'Preparing' : 'Waiting for wig record'),
      description: latestAllocation?.notes
        || (latestAllocation?.allocated_at
          ? `Allocated on ${formatDateTime(latestAllocation.allocated_at)}`
          : 'Preparation details appear here after wig production starts.'),
      state: getStepState({ index: 3, currentIndex, hasData: hasWig }),
    },
    {
      key: 'sent-hospital',
      title: 'Wig sent to hospital',
      label: normalizeStatusLabel(releaseStatus, 'Waiting for release'),
      description: latestAllocation?.released_at
        ? `Sent on ${formatDateTime(latestAllocation.released_at)}`
        : latestAllocation?.notes || 'Hospital release details will appear here.',
      state: getStepState({ index: 4, currentIndex, hasData: isSentToHospital }),
    },
    {
      key: 'ready-claiming',
      title: 'Ready for claiming',
      label: isReadyForClaiming ? 'Ready' : 'Not ready yet',
      description: isReadyForClaiming
        ? 'Please wait for hospital claiming instructions.'
        : 'The hospital will update this step once the wig is ready for claiming.',
      state: getStepState({ index: 5, currentIndex, hasData: isReadyForClaiming }),
    },
  ];

  void steps;

  const successfulStatusRank = {
    pending: 1,
    'accepted in production': 2,
    'accepted wig allocated': 3,
    'ready for pick up': 4,
    'to be release': 5,
    releasing: 6,
    released: 7,
    appealed: 7,
    'returned completed': 7,
  };
  const currentRank = successfulStatusRank[requestStatus] || 0;
  const stageState = (rank) => {
    if (isRequestStopped) return rank === 1 ? 'attention' : 'pending';
    if (currentRank > rank || hasReleased || hasConfirmedReceipt) return 'completed';
    if (currentRank === rank) return 'current';
    return 'pending';
  };
  const usesProductionPath = isInProduction || fulfillmentStatus.includes('production');
  const expectedReleaseStep = showActiveExpectedRelease ? {
    key: 'expected-release',
    title: 'Expected Wig Release',
    label: expectedReleaseHasPassed ? 'Awaiting update' : 'Estimate',
    description: expectedReleaseHasPassed
      ? `${formatDateTime(expectedReleaseAt)} · This estimated schedule has passed; your request status has not changed.`
      : formatDateTime(expectedReleaseAt),
    note: wigRequest?.expected_release_note || '',
    state: 'scheduled',
  } : null;
  const requestLifecycleSteps = wigRequest?.req_id ? [
    {
      key: 'request-submitted', title: 'Request Submitted', label: 'Submitted',
      description: wigRequest.request_date ? formatDateTime(wigRequest.request_date) : '', state: 'completed',
    },
    {
      key: 'under-review',
      title: isRequestStopped
        ? (requestStatus === 'rejected' ? 'Request Rejected' : 'Request Cancelled')
        : (isApproved ? 'Request Approved' : 'Request Under Review'),
      label: isRequestStopped ? normalizeStatusLabel(wigRequest.status, 'Request closed') : (currentRank > 1 ? 'Reviewed' : 'In review'),
      description: isRequestStopped
        ? wigRequest.status_reason || 'This request is no longer active.'
        : isApproved
          ? (wigRequest.approved_at ? formatDateTime(wigRequest.approved_at) : 'Your request was approved.')
          : 'The organization is reviewing your request.',
      state: stageState(1),
    },
    ...(!isRequestStopped ? [
    ...(usesProductionPath ? [{
      key: 'production', title: 'Wig In Production', label: currentRank >= 2 ? 'In production' : 'Waiting',
      description: 'Your wig is being prepared.', state: stageState(2),
    }, ...(expectedReleaseStep ? [expectedReleaseStep] : [])] : []),
    {
      key: 'allocated', title: 'Wig Allocated', label: hasAllocation || currentRank >= 3 ? 'Allocated' : 'Waiting',
      description: wig?.wig_name || 'A matching wig will be linked to your request.', state: stageState(3),
    },
    ...(!usesProductionPath && expectedReleaseStep ? [expectedReleaseStep] : []),
    {
      key: 'ready-pickup', title: 'Ready for Pick-up', label: currentRank >= 4 ? 'Ready' : 'Waiting',
      description: 'Your wig is ready for the release process.', state: stageState(4),
    },
    {
      key: 'preparing-release', title: 'Preparing for Release', label: currentRank >= 5 ? 'Preparing' : 'Waiting',
      description: 'Release arrangements are being prepared.', state: stageState(5),
    },
    {
      key: 'releasing', title: 'Wig Being Released', label: currentRank >= 6 ? 'Releasing' : 'Waiting',
      description: 'The organization is completing the wig release.', state: stageState(6),
    },
    {
      key: 'released', title: 'Wig Released', label: hasReleased ? 'Released' : 'Waiting',
      description: releaseReceipt?.released_at ? formatDateTime(releaseReceipt.released_at) : 'Waiting for staff release.',
      state: hasReleased ? 'completed' : stageState(7),
    },
    {
      key: 'confirm-receipt',
      title: hasConfirmedReceipt ? 'Receipt Confirmed' : 'Confirm Wig Receipt',
      label: hasConfirmedReceipt ? 'Confirmed' : (hasReleased ? 'Action needed' : 'Waiting'),
      description: hasConfirmedReceipt ? 'You confirmed physical receipt of this release.' : 'Confirm after you physically receive the wig.',
      state: hasConfirmedReceipt ? 'completed' : (hasReleased ? 'current' : 'pending'),
    },
    {
      key: 'received', title: 'Wig Received', label: hasConfirmedReceipt ? 'Received' : 'Not yet',
      description: hasConfirmedReceipt ? formatDateTime(releaseReceipt.received_confirmed_at) : 'Completed only after your confirmation.',
      state: hasConfirmedReceipt ? 'completed' : 'pending',
    },
    ] : []),
  ] : [];
  const patientSteps = requestStatus === 'appealed' && releaseAppeal
    ? buildPatientAppealTimelineSteps(releaseAppeal, wigRequest)
    : requestLifecycleSteps;

  const events = [
    wigRequest
      ? {
          key: `wig-request-${wigRequest.req_id}`,
          title: 'Wig request submitted',
          description: wigRequest.status_reason || wigRequest.notes || 'Your wig preferences were saved to the request.',
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
          key: `allocation-${latestAllocation.allocation_id}`,
          title: latestAllocation.released_at ? 'Wig released' : 'Wig allocated',
          description: latestAllocation.notes || 'Allocation details were updated for your request.',
          timestamp: formatDateTime(latestAllocation.released_at || latestAllocation.allocated_at),
          badge: normalizeStatusLabel(releaseStatus || 'Allocated', 'Allocated'),
        }
      : null,
  ].filter(Boolean);

  return {
    tracker: {
      hasActiveRequest,
      title: 'Wig Request Status',
      subtitle: 'Follow your wig request from submission to hospital claiming.',
      emptyTitle: 'No wig tracking yet',
      emptyDescription: 'Your wig request status will appear here after the first request is saved.',
      summary: {
        label: normalizeStatusLabel(currentStatus, 'Waiting for request'),
        tone: getToneFromStatus(currentStatus || ''),
        referenceLabel: wigRequest?.request_code ? 'Request code' : 'Patient code',
        referenceValue: wigRequest?.request_code || patientDetails.patient_code || 'Not assigned',
        helperText: latestAllocation?.allocated_at
          ? `Latest allocation ${formatDateTime(latestAllocation.allocated_at)}`
          : wigRequest?.request_date
            ? `Request date ${formatDateTime(wigRequest.request_date)}`
            : 'Waiting for the first wig request.',
      },
      steps: patientSteps,
      events,
      watch: {
        patientId: patientDetails.patient_id,
        reqId: wigRequest?.req_id || null,
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

      const { data: detail, error: detailError } = await fetchLatestHairSubmissionDetailBySubmissionId(submission.submission_id);
      if (detailError) {
        throw new Error(detailError.message || 'Unable to load donor tracking details.');
      }

      const { data: logistics, error: logisticsError } = await fetchHairSubmissionLogisticsBySubmissionId(submission.submission_id);

      if (logisticsError) throw new Error(logisticsError.message || 'Unable to load logistics updates.');

      return buildDonorTracker({
        submission,
        detail,
        logistics,
      });
    }

    if (role === 'patient') {
      const { data: patientDetails, error: patientDetailsError } = await fetchPatientDetailsByUserId(userId);
      if (patientDetailsError) {
        throw new Error(patientDetailsError.message || 'Unable to load patient details.');
      }

      if (!patientDetails?.patient_id) {
        return { tracker: null, error: null };
      }

      const { data: requests, error: wigRequestError } = await fetchPatientWigRequestsByPatientId(patientDetails.patient_id);
      if (wigRequestError) throw new Error(wigRequestError.message || 'Unable to load wig request tracking.');
      const { data: receipts, error: receiptError } = await fetchWigReleaseReceiptsByRequestIds(
        (requests || []).map((request) => request.req_id)
      );
      if (receiptError) throw new Error(receiptError.message || 'Unable to load release receipt tracking.');
      const latestReceiptByRequestId = new Map();
      (receipts || []).forEach((receipt) => {
        if (!latestReceiptByRequestId.has(String(receipt.req_id))) {
          latestReceiptByRequestId.set(String(receipt.req_id), receipt);
        }
      });
      const terminalStatuses = new Set(['released', 'returned completed', 'rejected', 'cancelled', 'canceled']);
      const activeRequest = (requests || []).find((request) => !terminalStatuses.has(normalizeTrackingStatusKey(request.status))) || null;
      const confirmationRequest = !activeRequest
        ? (requests || []).find((request) => {
            const receipt = latestReceiptByRequestId.get(String(request.req_id));
            return normalizeTrackingStatusKey(request.status) === 'released' && receipt && !receipt.received_confirmed_at;
          }) || null
        : null;
      const wigRequest = activeRequest || confirmationRequest;
      const releaseReceipt = wigRequest?.req_id
        ? latestReceiptByRequestId.get(String(wigRequest.req_id)) || null
        : null;
      const { data: latestAllocation, error: allocationError } = wigRequest?.req_id
        ? await fetchLatestWigAllocationTrackingByPatientId(patientDetails.patient_id, wigRequest.req_id)
        : { data: null, error: null };
      if (allocationError) throw new Error(allocationError.message || 'Unable to load wig allocation tracking.');
      const { data: releaseAppeal, error: appealError } = releaseReceipt?.receipt_id
        ? await fetchPatientWigReleaseAppeal(releaseReceipt.receipt_id)
        : { data: null, error: null };
      if (appealError) throw new Error(appealError.message || 'Unable to load appeal tracking.');

      return buildPatientTracker({
        patientDetails,
        wigRequest,
        latestAllocation,
        releaseReceipt,
        releaseAppeal,
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
