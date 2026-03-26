import * as ProfileAPI from '../api/profile.api';

const OPTIONAL_ROLE_TABLES = {
  donor: 'donor_profiles',
  patient: 'patient_profiles',
};

const SYSTEM_ROLE_KEYS = new Set(['id', 'created_at', 'updated_at', 'user_id', 'profile_id']);

const isMissingTableError = (error) => {
  const message = error?.message?.toLowerCase?.() || '';
  return message.includes('relation') && message.includes('does not exist');
};

const sanitizeSharedProfileUpdates = (updates = {}) => ({
  first_name: updates.first_name?.trim?.() || '',
  middle_name: updates.middle_name?.trim?.() || '',
  last_name: updates.last_name?.trim?.() || '',
  phone: updates.phone?.trim?.() || '',
  city: updates.city?.trim?.() || '',
  province: updates.province?.trim?.() || '',
});

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

    const { data, error } = await ProfileAPI.fetchOptionalRoleProfile(tableName, userId);
    if (error) {
      if (isMissingTableError(error)) {
        return { roleProfile: null, error: null };
      }
      throw new Error(error.message);
    }

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

    const tableName = OPTIONAL_ROLE_TABLES[role];
    let roleProfile = null;
    if (tableName && updates?.roleSpecific && Object.keys(updates.roleSpecific).length) {
      const roleResult = await ProfileAPI.updateOptionalRoleProfile(tableName, userId, updates.roleSpecific);
      if (roleResult.error && !isMissingTableError(roleResult.error)) {
        throw new Error(roleResult.error.message);
      }
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
