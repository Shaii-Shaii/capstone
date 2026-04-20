import { supabase } from '../api/supabase/client';
import { logAppError, logAppEvent } from '../utils/appErrors';

const donationDriveRequestsTable = 'Donation_Drive_Requests';
const donationDriveRegistrationsTable = 'Donation_Drive_Registrations';
const organizationsTable = 'Organizations';
const organizationMembersTable = 'Organization_Members';

const donationDriveSelect = `
  donation_drive_id:Donation_Drive_ID,
  organization_id:Organization_ID,
  event_title:Event_Title,
  event_overview:Event_Overview,
  start_date:Start_Date,
  end_date:End_Date,
  street:Street,
  region:Region,
  barangay:Barangay,
  city:City,
  province:Province,
  country:Country,
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
  status:Status,
  is_approved:Is_Approved,
  updated_at:Updated_At
`;

const donationDriveRegistrationSelect = `
  registration_id:Registration_ID,
  donation_drive_id:Donation_Drive_ID,
  user_id:User_ID,
  organization_id:Organization_ID,
  registration_status:Registration_Status,
  attendance_status:Attendance_Status,
  registered_at:Registered_At,
  updated_at:Updated_At
`;

const DRIVE_QR_VALIDITY_MS = 15 * 60 * 1000;

const normalizeRegistrationStatus = (value = '') => String(value || '').trim().toLowerCase();

const resolveDriveQrState = (row) => {
  const registrationStatus = normalizeRegistrationStatus(row?.registration_status);
  const attendanceStatus = normalizeRegistrationStatus(row?.attendance_status);
  const generatedAt = row?.registered_at || row?.updated_at || null;
  const generatedTime = generatedAt ? new Date(generatedAt).getTime() : null;
  const expiresAt = Number.isFinite(generatedTime)
    ? new Date(generatedTime + DRIVE_QR_VALIDITY_MS).toISOString()
    : null;
  const now = Date.now();
  const isActivated = (
    ['activated', 'active', 'approved', 'used', 'scanned', 'participated', 'attended'].includes(registrationStatus)
    || ['marked', 'attended', 'present', 'checked in', 'checked-in'].includes(attendanceStatus)
  );
  const isExplicitlyExpired = registrationStatus === 'expired' || registrationStatus === 'qr expired';
  const isExpired = !isActivated && (
    isExplicitlyExpired
    || (Number.isFinite(generatedTime) && generatedTime + DRIVE_QR_VALIDITY_MS <= now)
  );
  const isPending = Boolean(row?.registration_id) && !isActivated && !isExpired;

  return {
    state: isActivated ? 'activated' : isExpired ? 'expired' : isPending ? 'pending' : 'missing',
    generated_at: generatedAt,
    expires_at: expiresAt,
    activated_at: isActivated ? (row?.updated_at || row?.registered_at || null) : null,
    is_pending: isPending,
    is_expired: isExpired,
    is_activated: isActivated,
    can_regenerate: Boolean(row?.registration_id) && isExpired && !isActivated,
    is_valid: isActivated || isPending,
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
  status: row?.status || '',
  is_approved: row?.is_approved ?? false,
  updated_at: row?.updated_at || null,
  location_label: buildLocationLabel(row),
  address_label: buildFullAddressLabel(row),
});

const normalizeDonationDriveRegistration = (row) => ({
  registration_id: row?.registration_id || null,
  donation_drive_id: row?.donation_drive_id || null,
  user_id: row?.user_id || null,
  organization_id: row?.organization_id || null,
  registration_status: row?.registration_status || '',
  attendance_status: row?.attendance_status || '',
  registered_at: row?.registered_at || null,
  updated_at: row?.updated_at || null,
  qr: resolveDriveQrState(row),
});

const normalizeOrganizationMember = (row) => ({
  member_id: row?.member_id || null,
  organization_id: row?.organization_id || null,
  user_id: row?.user_id || null,
  membership_role: row?.membership_role || '',
  is_primary: Boolean(row?.is_primary),
  status: row?.status || '',
  created_by: row?.created_by || null,
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  is_active: String(row?.status || '').trim().toLowerCase() === 'active',
});

const normalizeDonationDrive = (row, organization = null, registration = null, membership = null) => ({
  id: row?.donation_drive_id || null,
  donation_drive_id: row?.donation_drive_id || null,
  organization_id: row?.organization_id || null,
  event_title: row?.event_title || '',
  event_overview: row?.event_overview || '',
  short_overview: buildShortOverview(row?.event_overview),
  start_date: row?.start_date || null,
  end_date: row?.end_date || null,
  street: row?.street || '',
  region: row?.region || '',
  barangay: row?.barangay || '',
  city: row?.city || '',
  province: row?.province || '',
  country: row?.country || '',
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
  requires_membership: Boolean(row?.organization_id),
  is_member: Boolean(membership?.is_active),
  can_rsvp: !registration,
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
    logAppError('donor_home.rsvp.lookup', result.error, {
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
    logAppEvent('donor_home.rsvp.lookup.duplicate', 'Multiple drive registrations found for the same donor.', {
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

  const existingResult = await fetchOrganizationMembership({
    organizationId,
    databaseUserId,
  });

  if (existingResult.data?.is_active) {
    return {
      data: existingResult.data,
      error: null,
      alreadyMember: true,
    };
  }

  const insertResult = await supabase
    .from(organizationMembersTable)
    .insert({
      Organization_ID: organizationId,
      User_ID: databaseUserId,
      Membership_Role: 'Member',
      Is_Primary: false,
      Status: 'Active',
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
    };
  }

  return {
    data: normalizeOrganizationMember(insertResult.data),
    error: null,
    alreadyMember: false,
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
    .order('Is_Approved', { ascending: false })
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

export const fetchUpcomingDonationDrives = async (limit = 6) => {
  const today = new Date().toISOString();

  logAppEvent('donor_home.drives', 'Loading upcoming donation drives.', {
    table: donationDriveRequestsTable,
    limit,
    startDateFrom: today,
  });

  const result = await supabase
    .from(donationDriveRequestsTable)
    .select(donationDriveSelect)
    .not('Start_Date', 'is', null)
    .gte('Start_Date', today)
    .order('Start_Date', { ascending: true })
    .limit(limit);

  if (result.error) {
    logAppError('donor_home.drives', result.error, {
      table: donationDriveRequestsTable,
      limit,
      startDateFrom: today,
    });

    return {
      data: [],
      error: result.error,
    };
  }

  const organizationIds = [...new Set((result.data || []).map((row) => row?.organization_id).filter(Boolean))];
  const organizationsResult = await fetchOrganizationsByIds(organizationIds);

  return {
    data: (result.data || []).map((row) => normalizeDonationDrive(
      row,
      organizationsResult.data.get(row?.organization_id) || null
    )),
    error: null,
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

export const createDonationDriveRsvp = async ({
  driveId,
  databaseUserId,
  organizationId = null,
}) => {
  if (!driveId || !databaseUserId) {
    return {
      data: null,
      error: new Error('Drive RSVP requires the drive and donor account.'),
    };
  }

  const existingResult = await findExistingDriveRegistration(driveId, databaseUserId);
  if (existingResult.data) {
    if (existingResult.data?.qr?.can_regenerate) {
      const updateResult = await supabase
        .from(donationDriveRegistrationsTable)
        .update({
          Registration_Status: 'Pending QR',
          Attendance_Status: 'Not Marked',
          Registered_At: new Date().toISOString(),
        })
        .eq('Registration_ID', existingResult.data.registration_id)
        .select(donationDriveRegistrationSelect)
        .maybeSingle();

      if (updateResult.error) {
        logAppError('donor_home.rsvp.regenerate', updateResult.error, {
          table: donationDriveRegistrationsTable,
          driveId,
          databaseUserId,
          registrationId: existingResult.data.registration_id,
        });

        return {
          data: null,
          error: updateResult.error,
          alreadyRegistered: false,
          regenerated: false,
        };
      }

      return {
        data: normalizeDonationDriveRegistration(updateResult.data),
        error: null,
        alreadyRegistered: false,
        regenerated: true,
      };
    }

    return {
      data: existingResult.data,
      error: null,
      alreadyRegistered: true,
      regenerated: false,
    };
  }

  logAppEvent('donor_home.rsvp.create', 'Creating donation drive RSVP.', {
    table: donationDriveRegistrationsTable,
    driveId,
    databaseUserId,
    organizationId,
  });

  const insertResult = await supabase
    .from(donationDriveRegistrationsTable)
    .insert({
      Donation_Drive_ID: driveId,
      User_ID: databaseUserId,
      Organization_ID: organizationId || null,
      Registration_Status: 'Pending QR',
      Attendance_Status: 'Not Marked',
    })
    .select(donationDriveRegistrationSelect)
    .maybeSingle();

  if (insertResult.error) {
    logAppError('donor_home.rsvp.create', insertResult.error, {
      table: donationDriveRegistrationsTable,
      driveId,
      databaseUserId,
      organizationId,
    });

    return {
      data: null,
      error: insertResult.error,
      alreadyRegistered: false,
      regenerated: false,
    };
  }

  return {
    data: normalizeDonationDriveRegistration(insertResult.data),
    error: null,
    alreadyRegistered: false,
    regenerated: false,
  };
};

export const fetchOrganizationPreview = async (organizationId, driveLimit = 3) => {
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
      .not('Start_Date', 'is', null)
      .order('Start_Date', { ascending: true })
      .limit(driveLimit),
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
  const drives = (drivesResult.data || []).map((row) => normalizeDonationDrive(row, organization));

  return {
    data: {
      ...organization,
      drives,
      short_overview: buildShortOverview(`${organization.organization_type || ''} ${organization.location_label || ''}`.trim(), 100),
    },
    error: organizationResult.error || drivesResult.error,
  };
};

export const fetchOrganizationsWithDrives = async (limit = 24, driveLimitPerOrganization = 3) => {
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

  return {
    data: organizations.map((organization) => ({
      ...organization,
      drives: (drivesByOrganizationId.get(organization.organization_id) || [])
        .slice(0, driveLimitPerOrganization)
        .map((row) => normalizeDonationDrive(row, organization)),
    })),
    error: organizationsResult.error || drivesResult.error,
  };
};
