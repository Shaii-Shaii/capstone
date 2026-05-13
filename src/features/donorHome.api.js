import { supabase } from '../api/supabase/client';
import { logAppError, logAppEvent } from '../utils/appErrors';
import { canSubmitHairDonation, mapDonationPermissionError } from './donorCompliance.service';

const donationDriveRequestsTable = 'Donation_Drive_Requests';
const donationDriveRegistrationsTable = 'Donation_Drive_Registrations';
const organizationsTable = 'Organizations';
const organizationMembersTable = 'Organization_Members';
const notificationTable = 'notification';

const donationDriveSelect = `
  donation_drive_id:Donation_Drive_ID,
  organization_id:Organization_ID,
  event_title:Event_Title,
  event_overview:Event_Overview,
  start_date:Start_Date,
  end_date:End_Date,
  proposal_attachment:Proposal_Attachment,
  proposal_attachment_bucket:Proposal_Attachment_Bucket,
  street:Street,
  region:Region,
  barangay:Barangay,
  city:City,
  province:Province,
  country:Country,
  latitude:Latitude,
  longitude:Longitude,
  status:Status,
  is_open_for_all:Is_Open_For_All,
  donation_setup_type:Donation_Setup_Type,
  updated_at:Updated_At
`;

const organizationSelect = `
  organization_id:Organization_ID,
  organization_name:Organization_Name,
  organization_type:Organization_Type,
  organization_logo_url:Organization_Logo_URL,
  street:Street,
  region:Region,
  barangay:Barangay,
  city:City,
  province:Province,
  country:Country,
  contact_number:Contact_Number,
  status:Status,
  is_approved:Is_Approved,
  approval_status:Approval_Status,
  review_notes:Review_Notes,
  created_at:Created_At,
  updated_at:Updated_At
`;

const donationDriveRegistrationSelect = `
  registration_id:Registration_ID,
  donation_drive_id:Donation_Drive_ID,
  user_id:User_ID,
  registration_status:Registration_Status,
  attendance_status:Attendance_Status,
  registered_at:Registered_At,
  updated_at:Updated_At,
  attendance_marked_at:Attendance_Marked_At
`;

const normalizeRegistrationStatus = (value = '') => String(value || '').trim().toLowerCase();
const normalizeDriveStatus = (value = '') => String(value || '').trim().toLowerCase();
const getStartOfTodayIso = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
};

const getDriveCompareDate = (drive) => drive?.end_date || drive?.start_date || null;
const isDrivePublic = (drive = null) => Boolean(drive?.is_open_for_all);
const doesDriveRequireMembership = (drive = null) => (
  Boolean(drive?.organization_id) && !isDrivePublic(drive)
);

const isUpcomingDrive = (drive) => {
  const compareDate = getDriveCompareDate(drive);
  if (!compareDate) return false;
  return new Date(compareDate).getTime() >= new Date(getStartOfTodayIso()).getTime();
};

const sortDrivesForHome = (rows = []) => (
  [...rows].sort((left, right) => {
    const leftUpcoming = isUpcomingDrive(left);
    const rightUpcoming = isUpcomingDrive(right);
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;

    const leftDate = leftUpcoming
      ? (left?.start_date || left?.end_date || left?.updated_at)
      : (left?.updated_at || left?.end_date || left?.start_date);
    const rightDate = rightUpcoming
      ? (right?.start_date || right?.end_date || right?.updated_at)
      : (right?.updated_at || right?.end_date || right?.start_date);
    const leftTime = leftDate ? new Date(leftDate).getTime() : 0;
    const rightTime = rightDate ? new Date(rightDate).getTime() : 0;

    if (leftUpcoming) return leftTime - rightTime;
    return rightTime - leftTime;
  })
);

const resolveDriveQrState = (row) => {
  const attendanceStatus = normalizeRegistrationStatus(row?.attendance_status);
  const hasRegistration = Boolean(row?.registration_id);
  const isUsed = Boolean(row?.attendance_marked_at)
    || ['marked', 'attended', 'present', 'checked in', 'checked-in'].includes(attendanceStatus);

  return {
    state: isUsed ? 'used' : hasRegistration ? 'registered' : 'missing',
    generated_at: row?.registered_at || row?.updated_at || null,
    used_at: isUsed ? (row?.attendance_marked_at || row?.updated_at || row?.registered_at || null) : null,
    is_used: isUsed,
    is_valid: hasRegistration && !isUsed,
  };
};

const organizationMemberSelect = `
  member_id:Member_ID,
  organization_id:Organization_ID,
  user_id:User_ID,
  membership_role:Membership_Role,
  is_primary:Is_Primary,
  status:Status,
  created_by:Created_By,
  created_at:Created_At,
  updated_at:Updated_At
`;

const buildLocationLabel = (row) => (
  [row?.city, row?.province, row?.country]
    .filter(Boolean)
    .join(', ')
    .trim()
);

const buildFullAddressLabel = (row) => (
  [row?.street, row?.barangay, row?.city, row?.province, row?.country]
    .filter(Boolean)
    .join(', ')
    .trim()
);

const isRemoteUrl = (value = '') => /^https?:\/\//i.test(String(value || '').trim());

const buildDonationDriveAttachmentUrl = (row = {}) => {
  const attachment = String(row?.proposal_attachment || '').trim();
  if (!attachment) return '';
  if (isRemoteUrl(attachment)) return attachment;
  if (!row?.proposal_attachment_bucket) return '';

  const { data } = supabase.storage
    .from(row.proposal_attachment_bucket)
    .getPublicUrl(attachment);

  return data?.publicUrl || '';
};

const buildShortOverview = (value, maxLength = 140) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
};

const normalizeOrganization = (row) => ({
  id: row?.organization_id || null,
  organization_id: row?.organization_id || null,
  organization_name: row?.organization_name || '',
  organization_type: row?.organization_type || '',
  organization_logo_url: row?.organization_logo_url || '',
  street: row?.street || '',
  region: row?.region || '',
  barangay: row?.barangay || '',
  city: row?.city || '',
  province: row?.province || '',
  country: row?.country || '',
  contact_number: row?.contact_number || '',
  status: row?.status || '',
  is_approved: row?.is_approved ?? false,
  approval_status: row?.approval_status || '',
  review_notes: row?.review_notes || '',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  location_label: buildLocationLabel(row),
  address_label: buildFullAddressLabel(row),
});

const normalizeDonationDriveRegistration = (row) => ({
  registration_id: row?.registration_id || null,
  donation_drive_id: row?.donation_drive_id || null,
  user_id: row?.user_id || null,
  registration_status: row?.registration_status || '',
  attendance_status: row?.attendance_status || '',
  registered_at: row?.registered_at || null,
  updated_at: row?.updated_at || null,
  attendance_marked_at: row?.attendance_marked_at || null,
  qr: resolveDriveQrState(row),
});

const normalizeOrganizationMember = (row) => ({
  membership_role: row?.membership_role || '',
  membership_role_normalized: String(row?.membership_role || '').trim().toLowerCase(),
  member_id: row?.member_id || null,
  organization_id: row?.organization_id || null,
  user_id: row?.user_id || null,
  is_primary: Boolean(row?.is_primary),
  status: row?.status || '',
  created_by: row?.created_by || null,
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  is_active: String(row?.status || '').trim().toLowerCase() === 'active',
  is_pending: (
    String(row?.status || '').trim().toLowerCase() === 'inactive'
    && String(row?.membership_role || '').trim().toLowerCase().startsWith('pending')
  ),
});

const createOrganizationJoinPendingNotification = async ({
  databaseUserId,
  organizationName,
}) => {
  if (!databaseUserId || !organizationName) return;

  const nowIso = new Date().toISOString();
  const title = 'Organization join request submitted';
  const message = `Your request to join ${organizationName} is pending approval.`;

  const result = await supabase
    .from(notificationTable)
    .insert({
      user_id: databaseUserId,
      type: 'organization_membership_pending',
      title,
      message,
      status: 'Unread',
      updated_at: nowIso,
    })
    .select('notification_id')
    .maybeSingle();

  if (result.error) {
    logAppError('donor_home.organization_membership.pending_notification', result.error, {
      table: notificationTable,
      databaseUserId,
      organizationName,
    });
  }
};

const normalizeDonationDrive = (row, organization = null, registration = null, membership = null) => ({
  id: row?.donation_drive_id || null,
  donation_drive_id: row?.donation_drive_id || null,
  organization_id: row?.organization_id || null,
  event_title: row?.event_title || '',
  event_overview: row?.event_overview || '',
  short_overview: buildShortOverview(row?.event_overview),
  start_date: row?.start_date || null,
  end_date: row?.end_date || null,
  proposal_attachment: row?.proposal_attachment || '',
  proposal_attachment_bucket: row?.proposal_attachment_bucket || '',
  event_image_url: buildDonationDriveAttachmentUrl(row),
  street: row?.street || '',
  region: row?.region || '',
  barangay: row?.barangay || '',
  city: row?.city || '',
  province: row?.province || '',
  country: row?.country || '',
  latitude: row?.latitude ?? null,
  longitude: row?.longitude ?? null,
  status: row?.status || '',
  is_open_for_all: row?.is_open_for_all ?? false,
  donation_setup_type: row?.donation_setup_type || '',
  updated_at: row?.updated_at || null,
  location_label: buildLocationLabel(row),
  address_label: buildFullAddressLabel(row),
  organization_name: organization?.organization_name || '',
  organization_logo_url: organization?.organization_logo_url || '',
  organization: organization || null,
  registration: registration || null,
  membership: membership || null,
  is_public: isDrivePublic(row),
  visibility_scope: isDrivePublic(row) ? 'public' : 'private',
  requires_membership: doesDriveRequireMembership(row),
  is_member: Boolean(membership?.is_active),
  can_view: !doesDriveRequireMembership(row) || Boolean(membership?.is_active) || Boolean(registration?.registration_id),
  can_join: !registration && (!doesDriveRequireMembership(row) || Boolean(membership?.is_active)),
});

const sortByNewestTimestamp = (rows = [], timestampFields = []) => (
  [...rows].sort((left, right) => {
    const leftValue = timestampFields
      .map((field) => left?.[field])
      .find(Boolean);
    const rightValue = timestampFields
      .map((field) => right?.[field])
      .find(Boolean);

    const leftTime = leftValue ? new Date(leftValue).getTime() : 0;
    const rightTime = rightValue ? new Date(rightValue).getTime() : 0;
    if (rightTime !== leftTime) return rightTime - leftTime;
    return (right?.registration_id || right?.donation_drive_id || right?.organization_id || 0)
      - (left?.registration_id || left?.donation_drive_id || left?.organization_id || 0);
  })
);

const findExistingDriveRegistration = async (driveId, databaseUserId) => {
  if (!driveId || !databaseUserId) {
    return { data: null, error: null };
  }

  const result = await supabase
    .from(donationDriveRegistrationsTable)
    .select(donationDriveRegistrationSelect)
    .eq('Donation_Drive_ID', driveId)
    .eq('User_ID', databaseUserId)
    .order('Updated_At', { ascending: false });

  if (result.error) {
    logAppError('donor_home.drive_registration.lookup', result.error, {
      table: donationDriveRegistrationsTable,
      driveId,
      databaseUserId,
    });

    return {
      data: null,
      error: result.error,
    };
  }

  const normalizedRows = (result.data || []).map(normalizeDonationDriveRegistration);
  if (normalizedRows.length > 1) {
    logAppEvent('donor_home.drive_registration.lookup.duplicate', 'Multiple drive registrations found for the same donor.', {
      table: donationDriveRegistrationsTable,
      driveId,
      databaseUserId,
      registrationIds: normalizedRows.map((item) => item.registration_id),
    }, 'warn');
  }

  return {
    data: sortByNewestTimestamp(normalizedRows, ['updated_at', 'registered_at'])[0] || null,
    error: null,
  };
};

const findDriveRegistrationsByUserIdAndDriveIds = async (driveIds = [], databaseUserId) => {
  if (!databaseUserId || !driveIds.length) {
    return {
      data: new Map(),
      error: null,
    };
  }

  const result = await supabase
    .from(donationDriveRegistrationsTable)
    .select(donationDriveRegistrationSelect)
    .eq('User_ID', databaseUserId)
    .in('Donation_Drive_ID', driveIds)
    .order('Updated_At', { ascending: false });

  if (result.error) {
    logAppError('donor_home.drive_registrations.by_drive_ids', result.error, {
      table: donationDriveRegistrationsTable,
      databaseUserId,
      driveIds,
    });

    return {
      data: new Map(),
      error: result.error,
    };
  }

  const byDriveId = new Map();
  (result.data || [])
    .map(normalizeDonationDriveRegistration)
    .forEach((registration) => {
      if (!registration?.donation_drive_id || byDriveId.has(registration.donation_drive_id)) {
        return;
      }

      byDriveId.set(registration.donation_drive_id, registration);
    });

  return {
    data: byDriveId,
    error: null,
  };
};

const fetchOrganizationsByIds = async (organizationIds = []) => {
  if (!organizationIds.length) {
    return {
      data: new Map(),
      error: null,
    };
  }

  const result = await supabase
    .from(organizationsTable)
    .select(organizationSelect)
    .in('Organization_ID', organizationIds);

  if (result.error) {
    logAppError('donor_home.organizations.by_ids', result.error, {
      table: organizationsTable,
      organizationIds,
    });

    return {
      data: new Map(),
      error: result.error,
    };
  }

  return {
    data: new Map(
      (result.data || [])
        .map(normalizeOrganization)
        .map((item) => [item.organization_id, item])
    ),
    error: null,
  };
};

export const fetchOrganizationMembershipsByUserId = async (databaseUserId) => {
  if (!databaseUserId) {
    return {
      data: [],
      error: null,
    };
  }

  const result = await supabase
    .from(organizationMembersTable)
    .select(organizationMemberSelect)
    .eq('User_ID', databaseUserId)
    .order('Updated_At', { ascending: false });

  if (result.error) {
    logAppError('donor_home.organization_memberships', result.error, {
      table: organizationMembersTable,
      databaseUserId,
    });

    return {
      data: [],
      error: result.error,
    };
  }

  return {
    data: (result.data || []).map(normalizeOrganizationMember),
    error: null,
  };
};

export const fetchDonationDriveRegistrationsByUserId = async (databaseUserId) => {
  if (!databaseUserId) {
    return {
      data: [],
      error: null,
    };
  }

  const result = await supabase
    .from(donationDriveRegistrationsTable)
    .select(donationDriveRegistrationSelect)
    .eq('User_ID', databaseUserId)
    .order('Updated_At', { ascending: false });

  if (result.error) {
    logAppError('donor_home.drive_registrations', result.error, {
      table: donationDriveRegistrationsTable,
      databaseUserId,
    });

    return {
      data: [],
      error: result.error,
    };
  }

  return {
    data: (result.data || []).map(normalizeDonationDriveRegistration),
    error: null,
  };
};

export const createDonationDriveRegistration = async ({
  driveId,
  databaseUserId,
}) => {
  if (!driveId || !databaseUserId) {
    return {
      data: null,
      error: new Error('Donation drive and donor account are required before joining a drive.'),
      alreadyRegistered: false,
    };
  }

  const permission = await canSubmitHairDonation(databaseUserId);
  if (!permission.allowed) {
    const permissionError = new Error(mapDonationPermissionError(permission.reason));
    permissionError.code = permission.reason;
    return {
      data: null,
      error: permissionError,
      alreadyRegistered: false,
    };
  }

  const driveResult = await supabase
    .from(donationDriveRequestsTable)
    .select(donationDriveSelect)
    .eq('Donation_Drive_ID', driveId)
    .maybeSingle();

  if (driveResult.error) {
    return {
      data: null,
      error: driveResult.error,
      alreadyRegistered: false,
    };
  }

  if (!driveResult.data) {
    return {
      data: null,
      error: new Error('The selected donation drive could not be found.'),
      alreadyRegistered: false,
    };
  }

  const driveStatus = String(driveResult.data.status || '').trim().toLowerCase();
  if (driveStatus !== 'approved') {
    return {
      data: null,
      error: new Error('This donation drive is not open for registration right now.'),
      alreadyRegistered: false,
    };
  }

  if (!isUpcomingDrive(driveResult.data)) {
    return {
      data: null,
      error: new Error('This donation drive has already ended.'),
      alreadyRegistered: false,
    };
  }

  if (doesDriveRequireMembership(driveResult.data)) {
    const membershipResult = await fetchOrganizationMembership({
      organizationId: driveResult.data.organization_id || null,
      databaseUserId,
    });

    if (membershipResult.error) {
      return {
        data: null,
        error: membershipResult.error,
        alreadyRegistered: false,
      };
    }

    if (!membershipResult.data?.is_active) {
      return {
        data: null,
        error: new Error('This is a private donation drive. Join the partner organization first.'),
        alreadyRegistered: false,
      };
    }
  }

  const existingResult = await findExistingDriveRegistration(driveId, databaseUserId);
  if (existingResult.error) {
    return {
      data: null,
      error: existingResult.error,
      alreadyRegistered: false,
    };
  }

  if (existingResult.data?.registration_id) {
    return {
      data: existingResult.data,
      error: null,
      alreadyRegistered: true,
    };
  }

  const insertResult = await supabase
    .from(donationDriveRegistrationsTable)
    .insert({
      Donation_Drive_ID: driveId,
      User_ID: databaseUserId,
      Registration_Status: 'Approved',
      Attendance_Status: 'Not Marked',
    })
    .select(donationDriveRegistrationSelect)
    .maybeSingle();

  if (insertResult.error) {
    logAppError('donor_home.drive_registration.create', insertResult.error, {
      table: donationDriveRegistrationsTable,
      driveId,
      databaseUserId,
    });

    return {
      data: null,
      error: insertResult.error,
      alreadyRegistered: false,
    };
  }

  return {
    data: normalizeDonationDriveRegistration(insertResult.data),
    error: null,
    alreadyRegistered: false,
  };
};

export const fetchOrganizationMembership = async ({
  organizationId,
  databaseUserId,
}) => {
  if (!organizationId || !databaseUserId) {
    return {
      data: null,
      error: null,
    };
  }

  const result = await supabase
    .from(organizationMembersTable)
    .select(organizationMemberSelect)
    .eq('Organization_ID', organizationId)
    .eq('User_ID', databaseUserId)
    .order('Updated_At', { ascending: false });

  if (result.error) {
    logAppError('donor_home.organization_membership.lookup', result.error, {
      table: organizationMembersTable,
      organizationId,
      databaseUserId,
    });

    return {
      data: null,
      error: result.error,
    };
  }

  const normalizedRows = (result.data || []).map(normalizeOrganizationMember);
  const activeMembership = normalizedRows.find((item) => item.is_active) || normalizedRows[0] || null;

  return {
    data: activeMembership,
    error: null,
  };
};

export const joinOrganizationMembership = async ({
  organizationId,
  databaseUserId,
}) => {
  if (!organizationId || !databaseUserId) {
    return {
      data: null,
      error: new Error('Joining an organization requires the organization and donor account.'),
      alreadyMember: false,
    };
  }

  const organizationResult = await supabase
    .from(organizationsTable)
    .select(organizationSelect)
    .eq('Organization_ID', organizationId)
    .maybeSingle();

  if (organizationResult.error) {
    logAppError('donor_home.organization_membership.organization_lookup', organizationResult.error, {
      table: organizationsTable,
      organizationId,
      databaseUserId,
    });

    return {
      data: null,
      error: organizationResult.error,
      alreadyMember: false,
    };
  }

  if (!organizationResult.data) {
    return {
      data: null,
      error: new Error('The selected organization could not be found.'),
      alreadyMember: false,
    };
  }

  const organization = normalizeOrganization(organizationResult.data);
  const isJoinable = (
    String(organization.status || '').trim().toLowerCase() === 'active'
    && Boolean(organization.is_approved)
    && String(organization.approval_status || '').trim().toLowerCase() === 'approved'
  );

  if (!isJoinable) {
    return {
      data: null,
      error: new Error('This organization is not available to join right now.'),
      alreadyMember: false,
    };
  }

  const existingResult = await fetchOrganizationMembership({
    organizationId,
    databaseUserId,
  });

  if (existingResult.error) {
    return {
      data: null,
      error: existingResult.error,
      alreadyMember: false,
    };
  }

  if (existingResult.data?.is_active) {
    return {
      data: existingResult.data,
      error: null,
      alreadyMember: true,
      alreadyPending: false,
      requestSubmitted: false,
    };
  }

  if (existingResult.data?.is_pending) {
    return {
      data: existingResult.data,
      error: null,
      alreadyMember: false,
      alreadyPending: true,
      requestSubmitted: false,
    };
  }

  if (existingResult.data?.member_id) {
    const updateResult = await supabase
      .from(organizationMembersTable)
      .update({
        Membership_Role: 'Pending Approval',
        Is_Primary: false,
        Status: 'Inactive',
        Updated_At: new Date().toISOString(),
      })
      .eq('Member_ID', existingResult.data.member_id)
      .select(organizationMemberSelect)
      .maybeSingle();

    if (updateResult.error) {
      logAppError('donor_home.organization_membership.reactivate', updateResult.error, {
        table: organizationMembersTable,
        organizationId,
        databaseUserId,
        memberId: existingResult.data.member_id,
      });

      return {
        data: null,
        error: updateResult.error,
        alreadyMember: false,
        alreadyPending: false,
        requestSubmitted: false,
      };
    }

    const normalizedUpdatedMembership = normalizeOrganizationMember(updateResult.data);
    await createOrganizationJoinPendingNotification({
      databaseUserId,
      organizationName: organization.organization_name,
    });

    return {
      data: normalizedUpdatedMembership,
      error: null,
      alreadyMember: false,
      alreadyPending: false,
      requestSubmitted: true,
    };
  }

  const insertResult = await supabase
    .from(organizationMembersTable)
    .insert({
      Organization_ID: organizationId,
      User_ID: databaseUserId,
      Membership_Role: 'Pending Approval',
      Is_Primary: false,
      Status: 'Inactive',
      Created_By: databaseUserId,
    })
    .select(organizationMemberSelect)
    .maybeSingle();

  if (insertResult.error) {
    logAppError('donor_home.organization_membership.join', insertResult.error, {
      table: organizationMembersTable,
      organizationId,
      databaseUserId,
    });

    return {
      data: null,
      error: insertResult.error,
      alreadyMember: false,
      alreadyPending: false,
      requestSubmitted: false,
    };
  }

  const normalizedInsertedMembership = normalizeOrganizationMember(insertResult.data);
  await createOrganizationJoinPendingNotification({
    databaseUserId,
    organizationName: organization.organization_name,
  });

  return {
    data: normalizedInsertedMembership,
    error: null,
    alreadyMember: false,
    alreadyPending: false,
    requestSubmitted: true,
  };
};

export const leaveOrganizationMembership = async ({
  organizationId,
  databaseUserId,
}) => {
  if (!organizationId || !databaseUserId) {
    return {
      data: null,
      error: new Error('Leaving an organization requires the organization and donor account.'),
      alreadyLeft: false,
    };
  }

  const existingResult = await fetchOrganizationMembership({
    organizationId,
    databaseUserId,
  });

  if (existingResult.error) {
    return {
      data: null,
      error: existingResult.error,
      alreadyLeft: false,
    };
  }

  if (!existingResult.data?.member_id) {
    return {
      data: null,
      error: null,
      alreadyLeft: true,
    };
  }

  if (!existingResult.data?.is_active) {
    return {
      data: existingResult.data,
      error: null,
      alreadyLeft: true,
    };
  }

  const updateResult = await supabase
    .from(organizationMembersTable)
    .update({
      Membership_Role: 'Former Member',
      Is_Primary: false,
      Status: 'Inactive',
      Updated_At: new Date().toISOString(),
    })
    .eq('Member_ID', existingResult.data.member_id)
    .select(organizationMemberSelect)
    .maybeSingle();

  if (updateResult.error) {
    logAppError('donor_home.organization_membership.leave', updateResult.error, {
      table: organizationMembersTable,
      organizationId,
      databaseUserId,
      memberId: existingResult.data.member_id,
    });

    return {
      data: null,
      error: updateResult.error,
      alreadyLeft: false,
    };
  }

  return {
    data: normalizeOrganizationMember(updateResult.data),
    error: null,
    alreadyLeft: false,
  };
};

export const fetchFeaturedOrganizations = async (limit = 8) => {
  logAppEvent('donor_home.organizations', 'Loading featured organizations.', {
    table: organizationsTable,
    limit,
  });

  const result = await supabase
    .from(organizationsTable)
    .select(organizationSelect)
    .eq('Status', 'Active')
    .eq('Is_Approved', true)
    .eq('Approval_Status', 'Approved')
    .order('Updated_At', { ascending: false })
    .limit(limit);

  if (result.error) {
    logAppError('donor_home.organizations', result.error, {
      table: organizationsTable,
      limit,
    });
  }

  return {
    data: (result.data || []).map(normalizeOrganization),
    error: result.error,
  };
};

export const fetchUpcomingDonationDrives = async (limit = 6, databaseUserId = null) => {
  const normalizedLimit = Math.max(1, Number(limit) || 6);
  const queryLimit = Math.min(Math.max(normalizedLimit * 8, 40), 120);

  logAppEvent('donor_home.drives', 'Loading upcoming donation drives.', {
    table: donationDriveRequestsTable,
    limit: normalizedLimit,
    queryLimit,
    status: 'approved',
    databaseUserId: databaseUserId || null,
  });

  const result = await supabase
    .from(donationDriveRequestsTable)
    .select(donationDriveSelect)
    .ilike('Status', 'approved')
    .order('Start_Date', { ascending: true })
    .limit(queryLimit);

  if (result.error) {
    logAppError('donor_home.drives', result.error, {
      table: donationDriveRequestsTable,
      limit: normalizedLimit,
      status: 'approved',
    });

    return {
      data: [],
      error: result.error,
    };
  }

  const driveRows = result.data || [];
  const organizationIds = [...new Set(driveRows.map((row) => row?.organization_id).filter(Boolean))];
  const organizationsResult = await fetchOrganizationsByIds(organizationIds);
  const driveIds = driveRows.map((row) => row?.donation_drive_id).filter(Boolean);

  const [membershipsResult, registrationsResult] = databaseUserId
    ? await Promise.all([
        fetchOrganizationMembershipsByUserId(databaseUserId),
        findDriveRegistrationsByUserIdAndDriveIds(driveIds, databaseUserId),
      ])
    : [{ data: [], error: null }, { data: new Map(), error: null }];
  const membershipByOrganizationId = new Map(
    (membershipsResult.data || [])
      .filter((membership) => membership?.is_active)
      .map((membership) => [membership.organization_id, membership])
  );
  const registrationByDriveId = registrationsResult.data || new Map();

  const normalizedRows = driveRows.map((row) => {
    const membership = membershipByOrganizationId.get(row?.organization_id) || null;
    const registration = registrationByDriveId.get(row?.donation_drive_id) || null;
    return normalizeDonationDrive(
      row,
      organizationsResult.data.get(row?.organization_id) || null,
      registration,
      membership,
    );
  });

  const visibleRows = normalizedRows.filter((drive) => (
    normalizeDriveStatus(drive.status) === 'approved'
    && drive.can_view
    && isUpcomingDrive(drive)
  ));

  return {
    data: sortDrivesForHome(visibleRows).slice(0, normalizedLimit),
    error: organizationsResult.error || membershipsResult.error || registrationsResult.error || null,
  };
};

export const fetchDonationDrivePreview = async (driveId, databaseUserId = null) => {
  if (!driveId) {
    return {
      data: null,
      error: new Error('Donation drive ID is required.'),
    };
  }

  logAppEvent('donor_home.drive_preview', 'Loading donation drive preview.', {
    table: donationDriveRequestsTable,
    driveId,
    databaseUserId,
  });

  const driveResult = await supabase
    .from(donationDriveRequestsTable)
    .select(donationDriveSelect)
    .eq('Donation_Drive_ID', driveId)
    .maybeSingle();

  if (driveResult.error) {
    logAppError('donor_home.drive_preview', driveResult.error, {
      table: donationDriveRequestsTable,
      driveId,
    });

    return {
      data: null,
      error: driveResult.error,
    };
  }

  if (!driveResult.data) {
    return { data: null, error: null };
  }

  const [organizationsResult, registrationResult, membershipResult] = await Promise.all([
    fetchOrganizationsByIds(driveResult.data.organization_id ? [driveResult.data.organization_id] : []),
    findExistingDriveRegistration(driveId, databaseUserId),
    fetchOrganizationMembership({
      organizationId: driveResult.data.organization_id || null,
      databaseUserId,
    }),
  ]);

  return {
    data: normalizeDonationDrive(
      driveResult.data,
      organizationsResult.data.get(driveResult.data.organization_id) || null,
      registrationResult.data || null,
      membershipResult.data || null
    ),
    error: driveResult.error || organizationsResult.error || registrationResult.error || membershipResult.error,
  };
};

export const fetchDonationDriveDetail = async (driveId, databaseUserId = null) => (
  fetchDonationDrivePreview(driveId, databaseUserId)
);

export const fetchOrganizationPreview = async (organizationId, databaseUserId = null, driveLimit = 3) => {
  if (!organizationId) {
    return {
      data: null,
      error: new Error('Organization ID is required.'),
    };
  }

  logAppEvent('donor_home.organization_preview', 'Loading organization preview.', {
    table: organizationsTable,
    organizationId,
    driveLimit,
  });

  const [organizationResult, drivesResult] = await Promise.all([
    supabase
      .from(organizationsTable)
      .select(organizationSelect)
      .eq('Organization_ID', organizationId)
      .maybeSingle(),
    supabase
      .from(donationDriveRequestsTable)
      .select(donationDriveSelect)
      .eq('Organization_ID', organizationId)
      .ilike('Status', 'approved')
      .not('Start_Date', 'is', null)
      .order('Start_Date', { ascending: true })
      .limit(Math.max(driveLimit, 24)),
  ]);

  if (organizationResult.error) {
    logAppError('donor_home.organization_preview.organization', organizationResult.error, {
      table: organizationsTable,
      organizationId,
    });
  }

  if (drivesResult.error) {
    logAppError('donor_home.organization_preview.drives', drivesResult.error, {
      table: donationDriveRequestsTable,
      organizationId,
      driveLimit,
    });
  }

  if (!organizationResult.data) {
    return {
      data: null,
      error: organizationResult.error || drivesResult.error,
    };
  }

  const organization = normalizeOrganization(organizationResult.data);
  const driveRows = drivesResult.data || [];
  const driveIds = driveRows.map((row) => row?.donation_drive_id).filter(Boolean);
  const [membershipResult, registrationsResult] = await Promise.all([
    fetchOrganizationMembership({
      organizationId,
      databaseUserId,
    }),
    findDriveRegistrationsByUserIdAndDriveIds(driveIds, databaseUserId),
  ]);

  const membership = membershipResult.data || null;
  const drives = driveRows
    .map((row) => normalizeDonationDrive(
      row,
      organization,
      registrationsResult.data.get(row?.donation_drive_id) || null,
      membership
    ))
    .filter((drive) => drive.can_view);
  const upcomingDrives = drives.filter(isUpcomingDrive);
  const pastDrives = drives.filter((drive) => !isUpcomingDrive(drive));

  return {
    data: {
      ...organization,
      membership,
      drives,
      upcoming_drives: upcomingDrives,
      past_drives: pastDrives,
      short_overview: buildShortOverview(`${organization.organization_type || ''} ${organization.location_label || ''}`.trim(), 100),
    },
    error: organizationResult.error || drivesResult.error || membershipResult.error || registrationsResult.error,
  };
};

export const fetchOrganizationsWithDrives = async (limit = 24, driveLimitPerOrganization = 3, databaseUserId = null) => {
  const organizationsResult = await fetchFeaturedOrganizations(limit);
  const organizations = organizationsResult.data || [];
  const organizationIds = organizations.map((item) => item.organization_id).filter(Boolean);

  if (!organizationIds.length) {
    return {
      data: [],
      error: organizationsResult.error,
    };
  }

  const drivesResult = await supabase
    .from(donationDriveRequestsTable)
    .select(donationDriveSelect)
    .in('Organization_ID', organizationIds)
    .ilike('Status', 'approved')
    .not('Start_Date', 'is', null)
    .order('Start_Date', { ascending: true });

  if (drivesResult.error) {
    logAppError('donor_home.organizations_with_drives', drivesResult.error, {
      table: donationDriveRequestsTable,
      organizationIds,
      driveLimitPerOrganization,
    });

    return {
      data: organizations.map((organization) => ({
        ...organization,
        drives: [],
      })),
      error: drivesResult.error,
    };
  }

  const drivesByOrganizationId = new Map();
  (drivesResult.data || []).forEach((row) => {
    const currentRows = drivesByOrganizationId.get(row?.organization_id) || [];
    currentRows.push(row);
    drivesByOrganizationId.set(row?.organization_id, currentRows);
  });

  const membershipsResult = await fetchOrganizationMembershipsByUserId(databaseUserId);
  const membershipByOrganizationId = new Map(
    (membershipsResult.data || []).map((membership) => [membership.organization_id, membership])
  );

  return {
    data: organizations.map((organization) => {
      const membership = membershipByOrganizationId.get(organization.organization_id) || null;

      return {
        ...organization,
        membership,
        drives: (drivesByOrganizationId.get(organization.organization_id) || [])
          .map((row) => normalizeDonationDrive(row, organization, null, membership))
          .filter((drive) => drive.can_view && isUpcomingDrive(drive))
          .slice(0, driveLimitPerOrganization),
      };
    }),
    error: organizationsResult.error || drivesResult.error || membershipsResult.error,
  };
};

export const fetchRelevantDonationDriveUpdates = async ({
  databaseUserId,
  limit = 12,
}) => {
  if (!databaseUserId) {
    return {
      data: [],
      error: null,
    };
  }

  const [membershipsResult, registrationsResult] = await Promise.all([
    fetchOrganizationMembershipsByUserId(databaseUserId),
    fetchDonationDriveRegistrationsByUserId(databaseUserId),
  ]);

  const memberships = membershipsResult.data || [];
  const registrations = registrationsResult.data || [];
  const activeMemberships = memberships.filter((item) => item.is_active);
  const organizationIds = [...new Set(activeMemberships.map((item) => item.organization_id).filter(Boolean))];
  const driveIds = [...new Set(registrations.map((item) => item.donation_drive_id).filter(Boolean))];

  if (!organizationIds.length && !driveIds.length) {
    return {
      data: [],
      error: membershipsResult.error || registrationsResult.error || null,
    };
  }

  const today = getStartOfTodayIso();
  const [organizationDrivesResult, registeredDrivesResult] = await Promise.all([
    organizationIds.length
      ? supabase
          .from(donationDriveRequestsTable)
          .select(donationDriveSelect)
          .in('Organization_ID', organizationIds)
          .ilike('Status', 'approved')
          .not('Start_Date', 'is', null)
          .order('Start_Date', { ascending: true })
          .limit(limit)
      : Promise.resolve({ data: [], error: null }),
    driveIds.length
      ? supabase
          .from(donationDriveRequestsTable)
          .select(donationDriveSelect)
          .in('Donation_Drive_ID', driveIds)
          .ilike('Status', 'approved')
          .order('Updated_At', { ascending: false })
          .limit(limit)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (organizationDrivesResult.error) {
    logAppError('donor_home.relevant_drive_updates.organizations', organizationDrivesResult.error, {
      table: donationDriveRequestsTable,
      organizationIds,
      databaseUserId,
      startDateFrom: today,
    });
  }

  if (registeredDrivesResult.error) {
    logAppError('donor_home.relevant_drive_updates.registrations', registeredDrivesResult.error, {
      table: donationDriveRequestsTable,
      driveIds,
      databaseUserId,
    });
  }

  const rawDrives = [...(organizationDrivesResult.data || []), ...(registeredDrivesResult.data || [])];
  const uniqueDrives = new Map();
  rawDrives.filter(isUpcomingDrive).forEach((row) => {
    const driveId = row?.donation_drive_id;
    if (!driveId) return;
    const existing = uniqueDrives.get(driveId);
    if (!existing || new Date(row?.updated_at || 0).getTime() > new Date(existing?.updated_at || 0).getTime()) {
      uniqueDrives.set(driveId, row);
    }
  });

  const organizationLookup = await fetchOrganizationsByIds(
    [...new Set(Array.from(uniqueDrives.values()).map((row) => row?.organization_id).filter(Boolean))]
  );
  const registrationByDriveId = new Map(registrations.map((item) => [item.donation_drive_id, item]));
  const membershipByOrganizationId = new Map(activeMemberships.map((item) => [item.organization_id, item]));

  return {
    data: sortByNewestTimestamp(
      Array.from(uniqueDrives.values()).map((row) => normalizeDonationDrive(
        row,
        organizationLookup.data.get(row?.organization_id) || null,
        registrationByDriveId.get(row?.donation_drive_id) || null,
        membershipByOrganizationId.get(row?.organization_id) || null
      )),
      ['updated_at', 'start_date']
    ).slice(0, limit),
    error:
      membershipsResult.error
      || registrationsResult.error
      || organizationDrivesResult.error
      || registeredDrivesResult.error
      || organizationLookup.error
      || null,
  };
};
