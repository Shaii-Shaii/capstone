import * as ProfileAPI from '../api/profile.api';

const OPTIONAL_ROLE_TABLES = {
  donor: 'donor_profiles',
  patient: 'patient_details',
};

const SYSTEM_ROLE_KEYS = new Set(['id', 'created_at', 'updated_at', 'user_id', 'profile_id']);

const normalizeOptionalString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'string' ? value.trim() : value;
};

const sanitizeSharedProfileUpdates = (updates = {}) => ({
  first_name: normalizeOptionalString(updates.first_name),
  middle_name: normalizeOptionalString(updates.middle_name),
  last_name: normalizeOptionalString(updates.last_name),
  suffix: normalizeOptionalString(updates.suffix),
  phone: normalizeOptionalString(updates.phone),
  birthdate: updates.birthdate ?? undefined,
  gender: normalizeOptionalString(updates.gender),
  street: normalizeOptionalString(updates.street),
  barangay: normalizeOptionalString(updates.barangay),
  region: normalizeOptionalString(updates.region),
  city: normalizeOptionalString(updates.city),
  province: normalizeOptionalString(updates.province),
  country: normalizeOptionalString(updates.country),
  joined_date: updates.joined_date ?? undefined,
});

const fetchRoleProfile = async (role, userId) => {
  if (role === 'donor') {
    return await ProfileAPI.fetchDonorProfileByUserId(userId);
  }

  if (role === 'patient') {
    return await ProfileAPI.fetchPatientDetailsByUserId(userId);
  }

  return { data: null, error: null };
};

const updateRoleProfile = async (role, userId, updates) => {
  if (role === 'donor') {
    return await ProfileAPI.updateDonorProfile(userId, updates);
  }

  if (role === 'patient') {
    return await ProfileAPI.updatePatientDetails(userId, updates);
  }

  return { data: null, error: null };
};

export const getPatientLinkPreview = async (patientCode) => {
  try {
    const { data, error } = await ProfileAPI.fetchPatientDetailsByCode(patientCode);
    if (error) throw new Error(error.message);
    if (!data?.patient_id) {
      throw new Error('We could not find a patient record for that code.');
    }
    if (data.user_id) {
      throw new Error('This patient code is already linked to another account.');
    }

    return { patient: data, error: null };
  } catch (error) {
    return { patient: null, error: error.message };
  }
};

export const linkPatientRecordByCode = async ({ userId, patientCode, patientPicture }) => {
  try {
    if (!userId) throw new Error('User ID is required');
    if (!patientCode) throw new Error('Patient code is required');

    const { data, error } = await ProfileAPI.linkPatientDetailsToUserByCode({
      userIdentifier: userId,
      patientCode,
      patientPicture,
    });

    if (error) throw new Error(error.message);
    return { patient: data, error: null };
  } catch (error) {
    return { patient: null, error: error.message };
  }
};

export const getProfile = async (userId) => {
  try {
    if (!userId) throw new Error('User ID is required');

    const { data, error } = await ProfileAPI.fetchProfileById(userId);
    if (error) throw new Error(error.message);

    return { profile: data, error: null };
  } catch (error) {
    return { profile: null, error: error.message };
  }
};

export const getRoleProfile = async (userId, role) => {
  try {
    const tableName = OPTIONAL_ROLE_TABLES[role];
    if (!tableName || !userId) {
      return { roleProfile: null, error: null };
    }

    const { data, error } = await fetchRoleProfile(role, userId);
    if (error) throw new Error(error.message);

    return { roleProfile: data, error: null };
  } catch (error) {
    return { roleProfile: null, error: error.message };
  }
};

export const getProfileBundle = async (userId, role) => {
  const [{ profile, error: profileError }, { roleProfile, error: roleError }] = await Promise.all([
    getProfile(userId),
    getRoleProfile(userId, role),
  ]);

  return {
    profile,
    roleProfile,
    error: profileError || roleError || null,
  };
};

export const saveProfile = async (userId, updates, role) => {
  try {
    if (!userId) throw new Error('User ID is required');

    const sharedUpdates = sanitizeSharedProfileUpdates(updates);
    const { data, error } = await ProfileAPI.updateProfile(userId, sharedUpdates);
    if (error) throw new Error(error.message);

    const roleTableName = OPTIONAL_ROLE_TABLES[role];
    let roleProfile = null;
    if (roleTableName && updates?.roleSpecific && Object.keys(updates.roleSpecific).length) {
      const roleResult = await updateRoleProfile(role, userId, updates.roleSpecific);
      if (roleResult.error) throw new Error(roleResult.error.message);
      roleProfile = roleResult.data || null;
    }

    return {
      profile: data,
      roleProfile,
      error: null,
    };
  } catch (error) {
    return {
      profile: null,
      roleProfile: null,
      error: error.message,
    };
  }
};

export const saveAvatar = async (userId, avatarUrl) => {
  try {
    if (!userId) throw new Error('User ID is required');
    if (!avatarUrl) throw new Error('Avatar image is required');

    const { data, error } = await ProfileAPI.updateProfile(userId, {
      avatar_url: avatarUrl,
    });

    if (error) throw new Error(error.message);
    return { profile: data, error: null };
  } catch (error) {
    return { profile: null, error: error.message };
  }
};

export const getVisibleRoleFields = (roleProfile) => {
  if (!roleProfile) return [];

  return Object.entries(roleProfile)
    .filter(([key, value]) => !SYSTEM_ROLE_KEYS.has(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()),
      value: String(value),
    }));
};
