import { ensureActiveSession, supabase } from '../../../api/supabase/client';
import { logAppError, logAppEvent } from '../../../utils/appErrors';

const isUuid = (value) => typeof value === 'string' && value.includes('-');
const buildMissingSystemUserError = () => new Error('The logged-in account is not linked to an app user record.');
const getTodayDate = () => new Date().toISOString().slice(0, 10);
const profileAvatarStorageBucket =
  process.env.EXPO_PUBLIC_PROFILE_PICTURES_BUCKET
  || 'profile_pictures';
const patientOnboardingStorageBucket =
  process.env.EXPO_PUBLIC_PATIENT_ASSETS_BUCKET
  || 'patient_assets';
const buildQueryContext = ({ table, filter, authUserId = '', systemUserId = null, patientId = null, hospitalId = null }) => ({
  table,
  filter,
  authUserId: authUserId || null,
  systemUserId: systemUserId || null,
  patientId: patientId || null,
  hospitalId: hospitalId || null,
});

const getPayloadKeys = (payload = {}) => Object.keys(payload || {}).sort();
const buildSupabaseErrorMeta = (error) => ({
  message: error?.message || '',
  code: error?.code || '',
  details: error?.details || '',
  hint: error?.hint || '',
});

const buildMutationContext = ({
  table,
  operation,
  expectedAuthUserId = '',
  currentAuthUserId = '',
  systemUserId = null,
  patientId = null,
  payload = {},
}) => ({
  table,
  operation,
  expectedAuthUserId: expectedAuthUserId || null,
  currentAuthUserId: currentAuthUserId || null,
  systemUserId: systemUserId || null,
  patientId: patientId || null,
  payloadKeys: getPayloadKeys(payload),
});

const ensureMutationAuthContext = async ({
  table,
  operation,
  expectedAuthUserId = '',
  systemUserId = null,
  patientId = null,
  payload = {},
}) => {
  const sessionResult = await ensureActiveSession();
  const currentAuthUserId = sessionResult.session?.user?.id || '';
  const context = buildMutationContext({
    table,
    operation,
    expectedAuthUserId,
    currentAuthUserId,
    systemUserId,
    patientId,
    payload,
  });

  logAppEvent('profile.mutation.started', 'Authenticated mutation started.', context);

  if (sessionResult.error || !currentAuthUserId) {
    const authError = sessionResult.error || new Error('No active authenticated session found.');
    logAppError('profile.mutation.auth_missing', authError, context);
    return {
      error: authError,
      context,
      currentAuthUserId,
    };
  }

  if (expectedAuthUserId && currentAuthUserId !== expectedAuthUserId) {
    const mismatchError = new Error('Authenticated session does not match the expected user.');
    logAppError('profile.mutation.auth_mismatch', mismatchError, context);
    return {
      error: mismatchError,
      context,
      currentAuthUserId,
    };
  }

  return {
    error: null,
    context,
    currentAuthUserId,
  };
};

const resolveQueryRows = ({ table, filter, rows, authUserId = '', systemUserId = null, patientId = null, hospitalId = null }) => {
  const context = buildQueryContext({ table, filter, authUserId, systemUserId, patientId, hospitalId });
  const safeRows = Array.isArray(rows) ? rows : [];

  if (safeRows.length === 0) {
    logAppEvent('profile.query.zero_rows', 'No rows returned for single-row lookup.', {
      ...context,
      rowCount: 0,
    }, 'warn');
    return { data: null, error: null };
  }

  if (safeRows.length > 1) {
    logAppError('profile.query.multiple_rows', new Error('Multiple rows returned for single-row lookup.'), {
      ...context,
      rowCount: safeRows.length,
    });
  }

  return {
    data: safeRows[0] || null,
    error: null,
  };
};

const runSingleRowSelect = async ({
  table,
  filter,
  authUserId = '',
  systemUserId = null,
  patientId = null,
  hospitalId = null,
  queryBuilder,
}) => {
  const result = await queryBuilder.limit(2);
  if (result.error) {
    logAppError('profile.query.select_failed', result.error, buildQueryContext({
      table,
      filter,
      authUserId,
      systemUserId,
      patientId,
      hospitalId,
    }));

    return {
      data: null,
      error: result.error,
    };
  }

  return resolveQueryRows({
    table,
    filter,
    rows: result.data,
    authUserId,
    systemUserId,
    patientId,
    hospitalId,
  });
};

const normalizeSystemUser = (row, details = null) => ({
  id: row?.auth_user_id || '',
  user_id: row?.user_id || null,
  auth_user_id: row?.auth_user_id || '',
  email: row?.email || '',
  role: row?.role || '',
  is_active: row?.is_active ?? true,
  access_start: row?.access_start || null,
  access_end: row?.access_end || null,
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
  first_name: details?.first_name || '',
  middle_name: details?.middle_name || '',
  last_name: details?.last_name || '',
  suffix: details?.suffix || '',
  birthdate: details?.birthdate || null,
  gender: details?.gender || '',
  street: details?.street || '',
  region: details?.region || '',
  barangay: details?.barangay || '',
  city: details?.city || '',
  province: details?.province || '',
  country: details?.country || '',
  phone: details?.contact_number || '',
  contact_number: details?.contact_number || '',
  avatar_url: details?.photo_path || '',
  photo_path: details?.photo_path || '',
  joined_date: details?.joined_date || null,
  user_details_id: details?.user_details_id || null,
  user_details_created_at: details?.created_at || null,
  user_details_updated_at: details?.updated_at || null,
});

const normalizePatient = (row) => ({
  id: row?.patient_id || null,
  patient_id: row?.patient_id || null,
  user_id: row?.user_id || null,
  hospital_id: row?.hospital_id || null,
  patient_code: row?.patient_code || '',
  medical_condition: row?.medical_condition || '',
  patient_picture: row?.patient_picture || '',
  date_of_diagnosis: row?.date_of_diagnosis || null,
  guardian: row?.guardian || '',
  guardian_relationship: row?.guardian_relationship || '',
  guardian_contact_number: row?.guardian_contact_number || '',
  medical_document: row?.medical_document || '',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
});

const normalizeHospitalStaff = (row) => ({
  id: row?.link_id || null,
  link_id: row?.link_id || null,
  hospital_id: row?.hospital_id || null,
  user_id: row?.user_id || null,
  assigned_date: row?.assigned_date || null,
});

const normalizeHospitalRepresentative = (row) => ({
  id: row?.hospital_id || null,
  hospital_id: row?.hospital_id || null,
  hospital_name: row?.hospital_name || '',
  hospital_logo: row?.hospital_logo || '',
  country: row?.country || '',
  region: row?.region || '',
  city: row?.city || '',
  barangay: row?.barangay || '',
  street: row?.street || '',
  contact_number: row?.contact_number || '',
  created_at: row?.created_at || null,
  updated_at: row?.updated_at || null,
});

const normalizePatientLinkPreview = (row) => ({
  id: row?.patient_id || null,
  patient_id: row?.patient_id || null,
  patient_code: row?.patient_code || '',
  hospital_id: row?.hospital_id || null,
  hospital_name: row?.hospital_name || '',
  medical_condition: row?.medical_condition || '',
  patient_picture: row?.patient_picture || '',
  date_of_diagnosis: row?.date_of_diagnosis || null,
  guardian: row?.guardian || '',
  guardian_relationship: row?.guardian_relationship || '',
  guardian_contact_number: row?.guardian_contact_number || '',
  medical_document: row?.medical_document || '',
  user_id: row?.user_id || null,
  linked_auth_user_id: row?.linked_auth_user_id || '',
  first_name: row?.first_name || '',
  middle_name: row?.middle_name || '',
  last_name: row?.last_name || '',
  suffix: row?.suffix || '',
  full_name: row?.full_name || '',
});

const getFileExtension = ({ contentType = '', fileName = '' }) => {
  const normalizedContentType = String(contentType || '').toLowerCase();
  const normalizedFileName = String(fileName || '').trim().toLowerCase();

  if (normalizedContentType.includes('png') || normalizedFileName.endsWith('.png')) return 'png';
  if (normalizedContentType.includes('webp') || normalizedFileName.endsWith('.webp')) return 'webp';
  if (normalizedContentType.includes('gif') || normalizedFileName.endsWith('.gif')) return 'gif';
  return 'jpg';
};

const uploadProfileMedia = async ({
  authUserId,
  fileBody,
  contentType,
  fileName,
  folder = 'profile-media',
  bucket = profileAvatarStorageBucket,
  fileType = 'profile-media',
}) => {
  if (!authUserId) {
    return { data: null, error: new Error('Auth user ID is required.') };
  }

  if (!fileBody) {
    return { data: null, error: new Error('Media file is required.') };
  }

  const authContext = await ensureMutationAuthContext({
    table: 'storage.objects',
    operation: 'insert',
    expectedAuthUserId: authUserId,
    payload: {
      bucket,
      folder,
      fileName: fileName || '',
      contentType: contentType || 'image/jpeg',
    },
  });

  if (authContext.error) {
    return {
      data: null,
      error: authContext.error,
    };
  }

  const extension = getFileExtension({ contentType, fileName });
  const filePath = `${authUserId}/${folder}-${Date.now()}.${extension}`;
  logAppEvent('profile.storage.upload_started', 'Storage upload started.', {
    table: 'storage',
    bucket,
    authUserId,
    filePath,
    folder,
    fileType,
    contentType: contentType || 'image/jpeg',
  });

  const uploadResult = await supabase.storage
    .from(bucket)
    .upload(filePath, fileBody, {
      contentType: contentType || 'image/jpeg',
      upsert: false,
    });

  if (uploadResult.error) {
    logAppError('profile.storage.upload_failed', uploadResult.error, {
      table: 'storage',
      bucket,
      authUserId,
      filePath,
      folder,
      fileType,
      contentType: contentType || 'image/jpeg',
      currentAuthUserId: authContext.currentAuthUserId,
      supabaseError: buildSupabaseErrorMeta(uploadResult.error),
    });

    return {
      data: null,
      error: uploadResult.error,
    };
  }

  const { data: publicUrlData } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  logAppEvent('profile.storage.upload_succeeded', 'Profile media uploaded to storage.', {
    table: 'storage',
    bucket,
    authUserId,
    filePath,
    folder,
    fileType,
  });

  return {
    data: {
      bucket,
      filePath,
      publicUrl: publicUrlData?.publicUrl || filePath,
    },
    error: null,
  };
};

export const fetchSystemUserByAuthUserId = async (authUserId) => {
  return await runSingleRowSelect({
    table: 'users',
    filter: { auth_user_id: authUserId },
    authUserId,
    queryBuilder: supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', authUserId)
      .order('updated_at', { ascending: false }),
  });
};

export const fetchSystemUserByEmail = async (email) => {
  if (!email) {
    return { data: null, error: new Error('Email is required.') };
  }

  return await runSingleRowSelect({
    table: 'users',
    filter: { email: email.trim().toLowerCase() },
    queryBuilder: supabase
      .from('users')
      .select('*')
      .ilike('email', email.trim())
      .order('updated_at', { ascending: false }),
  });
};

export const createSystemUser = async ({ authUserId, email, role }) => {
  const result = await supabase
    .from('users')
    .insert([{
      auth_user_id: authUserId,
      email: email || null,
      role: role || null,
      is_active: true,
    }])
    .select()
    .maybeSingle();

  if (result.error) {
    logAppError('profile.query.insert_failed', result.error, buildQueryContext({
      table: 'users',
      filter: { auth_user_id: authUserId, email: email || null },
      authUserId,
    }));
    return result;
  }

  if (result.data?.user_id) {
    return result;
  }

  logAppEvent('profile.query.insert_no_row', 'Insert succeeded without a returned users row. Refetching.', {
    table: 'users',
    filter: { auth_user_id: authUserId, email: email || null },
    authUserId,
  }, 'warn');

  return await fetchSystemUserByAuthUserId(authUserId);
};

export const linkSystemUserToAuthUserId = async ({ userId, authUserId, email, role }) => {
  if (!userId || !authUserId) {
    return { data: null, error: new Error('User ID and auth user ID are required.') };
  }

  const payload = {
    auth_user_id: authUserId,
    updated_at: new Date().toISOString(),
  };

  if (email) {
    payload.email = email;
  }

  if (role) {
    payload.role = role;
  }

  const result = await supabase
    .from('users')
    .update(payload)
    .eq('user_id', userId)
    .select()
    .maybeSingle();

  if (result.error) {
    logAppError('profile.query.update_failed', result.error, buildQueryContext({
      table: 'users',
      filter: { user_id: userId },
      authUserId,
      systemUserId: userId,
    }));
    return result;
  }

  if (result.data?.user_id) {
    return result;
  }

  logAppEvent('profile.query.update_no_row', 'Update succeeded without a returned users row. Refetching.', {
    table: 'users',
    filter: { user_id: userId },
    authUserId,
    systemUserId: userId,
  }, 'warn');

  return await fetchSystemUserByAuthUserId(authUserId);
};

export const updateSystemUserRoleByAuthUserId = async ({ authUserId, role, email }) => {
  if (!authUserId) {
    return { data: null, error: new Error('Auth user ID is required.') };
  }

  const systemUserResult = await ensureSystemUserByAuthUserId(authUserId);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return {
      data: null,
      error: systemUserResult.error || buildMissingSystemUserError(),
    };
  }

  const payload = {
    role: role || null,
    updated_at: new Date().toISOString(),
  };

  if (email) {
    payload.email = email;
  }

  const result = await supabase
    .from('users')
    .update(payload)
    .eq('user_id', systemUserResult.data.user_id)
    .select()
    .maybeSingle();

  if (result.error) {
    return result;
  }

  if (!result.data?.user_id) {
    logAppEvent('profile.query.update_no_row', 'Role update returned no users row. Refetching.', {
      table: 'users',
      filter: { user_id: systemUserResult.data.user_id },
      authUserId,
      systemUserId: systemUserResult.data.user_id,
    }, 'warn');

    return await fetchSystemUserByAuthUserId(authUserId);
  }

  return {
    data: result.data,
    error: null,
  };
};

export const ensureSystemUserRecord = async ({ authUserId, email, role }) => {
  if (!authUserId) {
    return { data: null, error: new Error('Auth user ID is required.') };
  }

  const existing = await fetchSystemUserByAuthUserId(authUserId);
  if (existing.data?.user_id || existing.error) {
    return existing;
  }

  if (email) {
    const existingByEmail = await fetchSystemUserByEmail(email);
    if (existingByEmail.error) {
      return existingByEmail;
    }

    if (existingByEmail.data?.user_id) {
      const linkResult = await linkSystemUserToAuthUserId({
        userId: existingByEmail.data.user_id,
        authUserId,
        email,
        role: existingByEmail.data.role || role || null,
      });

      if (!linkResult.error) {
        return linkResult;
      }
    }
  }

  const createResult = await createSystemUser({
    authUserId,
    email: email || null,
    role: role || null,
  });

  if (!createResult.error) {
    return createResult;
  }

  const createErrorMessage = String(createResult.error?.message || '').toLowerCase();
  if (createErrorMessage.includes('duplicate') || createErrorMessage.includes('already exists')) {
    const retryByAuthId = await fetchSystemUserByAuthUserId(authUserId);
    if (retryByAuthId.data?.user_id || retryByAuthId.error) {
      return retryByAuthId;
    }

    if (email) {
      const retryByEmail = await fetchSystemUserByEmail(email);
      if (retryByEmail.data?.user_id || retryByEmail.error) {
        return retryByEmail;
      }
    }
  }

  return createResult;
};

export const ensureSystemUserByAuthUserId = async (authUserId) => {
  if (!authUserId) {
    return { data: null, error: new Error('Auth user ID is required.') };
  }

  const existing = await fetchSystemUserByAuthUserId(authUserId);
  if (existing.data?.user_id || existing.error) {
    return existing;
  }

  return { data: null, error: buildMissingSystemUserError() };
};

export const fetchUserDetailsBySystemUserId = async (systemUserId) => {
  return await runSingleRowSelect({
    table: 'user_details',
    filter: { user_id: systemUserId },
    systemUserId,
    queryBuilder: supabase
      .from('user_details')
      .select('*')
      .eq('user_id', systemUserId)
      .order('updated_at', { ascending: false }),
  });
};

export const fetchUserDetailsById = async (userDetailsId) => {
  if (!userDetailsId) {
    return { data: null, error: new Error('User details ID is required.') };
  }

  return await runSingleRowSelect({
    table: 'user_details',
    filter: { user_details_id: userDetailsId },
    queryBuilder: supabase
      .from('user_details')
      .select('*')
      .eq('user_details_id', userDetailsId)
      .order('updated_at', { ascending: false }),
  });
};

export const ensureUserDetailsBySystemUserId = async (systemUser) => {
  if (!systemUser?.user_id) {
    return { data: null, error: new Error('System user is required.') };
  }

  const existing = await fetchUserDetailsBySystemUserId(systemUser.user_id);
  if (existing.data?.user_details_id || existing.error) {
    return existing;
  }

  return { data: null, error: null };
};

export const createUserDetails = async ({ systemUserId, details = {} }) => {
  if (!systemUserId) {
    return { data: null, error: new Error('System user ID is required.') };
  }

  const authContext = await ensureMutationAuthContext({
    table: 'user_details',
    operation: 'insert',
    expectedAuthUserId: details.auth_user_id || '',
    systemUserId,
    payload: details,
  });

  if (authContext.error) {
    return { data: null, error: authContext.error };
  }

  const result = await supabase
    .from('user_details')
    .insert([{
      user_id: systemUserId,
      first_name: details.first_name || '',
      middle_name: details.middle_name || '',
      last_name: details.last_name || '',
      suffix: details.suffix || '',
      birthdate: details.birthdate || null,
      gender: details.gender || '',
      street: details.street || '',
      region: details.region || '',
      barangay: details.barangay || '',
      city: details.city || '',
      province: details.province || '',
      country: details.country || '',
      contact_number: details.contact_number || '',
      joined_date: details.joined_date || null,
      photo_path: details.photo_path || null,
      latitude: details.latitude ? Number(details.latitude) : null,
      longitude: details.longitude ? Number(details.longitude) : null,
    }])
    .select()
    .maybeSingle();

  if (result.error) {
    logAppError('profile.query.insert_failed', result.error, buildQueryContext({
      table: 'user_details',
      filter: { user_id: systemUserId },
      systemUserId,
      authUserId: authContext.currentAuthUserId,
    }));
    logAppError('profile.mutation.failed', result.error, {
      ...authContext.context,
      supabaseError: buildSupabaseErrorMeta(result.error),
    });
    return result;
  }

  if (result.data?.user_details_id) {
    return result;
  }

  logAppEvent('profile.query.insert_no_row', 'Insert succeeded without a returned user_details row. Refetching.', {
    table: 'user_details',
    filter: { user_id: systemUserId },
    systemUserId,
  }, 'warn');

  return await fetchUserDetailsBySystemUserId(systemUserId);
};

export const ensureUserDetailsRecord = async ({ systemUserId, details = {} }) => {
  if (!systemUserId) {
    return { data: null, error: new Error('System user ID is required.') };
  }

  const existing = await fetchUserDetailsBySystemUserId(systemUserId);
  if (existing.data?.user_details_id || existing.error) {
    return existing;
  }

  const createResult = await createUserDetails({ systemUserId, details });
  if (!createResult.error) {
    return createResult;
  }

  const createErrorMessage = String(createResult.error?.message || '').toLowerCase();
  if (createErrorMessage.includes('duplicate') || createErrorMessage.includes('already exists')) {
    return await fetchUserDetailsBySystemUserId(systemUserId);
  }

  return createResult;
};

export const ensureProfileInfrastructure = async ({
  authUserId,
  email,
  role,
  details = {},
}) => {
  if (!authUserId) {
    return { data: null, error: new Error('Auth user ID is required.') };
  }

  const systemUserResult = await ensureSystemUserRecord({
    authUserId,
    email,
    role,
  });

  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return {
      data: null,
      error: systemUserResult.error || buildMissingSystemUserError(),
    };
  }

  const normalizedDetails = {
    joined_date: details.joined_date || getTodayDate(),
    ...details,
  };

  const userDetailsResult = await ensureUserDetailsRecord({
    systemUserId: systemUserResult.data.user_id,
    details: normalizedDetails,
  });

  if (userDetailsResult.error) {
    return {
      data: null,
      error: userDetailsResult.error,
    };
  }

  return {
    data: normalizeSystemUser(systemUserResult.data, userDetailsResult.data || null),
    error: null,
  };
};

export const resolveSystemUser = async (userIdentifier, options = {}) => {
  const { ensure = true } = options;

  if (!userIdentifier && userIdentifier !== 0) {
    return { data: null, error: new Error('User ID is required.') };
  }

  if (!isUuid(userIdentifier)) {
    const result = await runSingleRowSelect({
      table: 'users',
      filter: { user_id: userIdentifier },
      systemUserId: userIdentifier,
      queryBuilder: supabase
        .from('users')
        .select('*')
        .eq('user_id', userIdentifier)
        .order('updated_at', { ascending: false }),
    });

    if (!result.data && !result.error) {
      return { data: null, error: buildMissingSystemUserError() };
    }

    return result;
  }

  if (ensure) {
    return await ensureSystemUserByAuthUserId(userIdentifier);
  }

  const result = await fetchSystemUserByAuthUserId(userIdentifier);
  if (!result.data && !result.error) {
    return { data: null, error: buildMissingSystemUserError() };
  }

  return result;
};

export const resolveDatabaseUserId = async (userIdentifier, options = {}) => {
  const systemUserResult = await resolveSystemUser(userIdentifier, options);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return {
      data: null,
      error: systemUserResult.error || buildMissingSystemUserError(),
    };
  }

  return {
    data: systemUserResult.data.user_id,
    error: null,
  };
};

export const fetchProfileById = async (authUserId) => {
  const systemUserResult = await resolveSystemUser(authUserId, { ensure: false });
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const userDetailsResult = await ensureUserDetailsRecord({
    systemUserId: systemUserResult.data.user_id,
    details: {
      joined_date: getTodayDate(),
    },
  });
  if (userDetailsResult.error) {
    return { data: null, error: userDetailsResult.error };
  }

  return {
    data: normalizeSystemUser(systemUserResult.data, userDetailsResult.data),
    error: null,
  };
};

export const updateProfile = async (authUserId, updates) => {
  const systemUserResult = await ensureSystemUserByAuthUserId(authUserId);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const ensuredDetailsResult = await ensureUserDetailsRecord({
    systemUserId: systemUserResult.data.user_id,
    details: {
      joined_date: getTodayDate(),
    },
  });

  if (ensuredDetailsResult.error) {
    return { data: null, error: ensuredDetailsResult.error };
  }

  if (!ensuredDetailsResult.data?.user_details_id) {
    const missingDetailsError = new Error('User details row could not be resolved.');
    logAppError('profile.query.update_failed', missingDetailsError, buildQueryContext({
      table: 'user_details',
      filter: { user_id: systemUserResult.data.user_id },
      authUserId,
      systemUserId: systemUserResult.data.user_id,
    }));
    return { data: null, error: missingDetailsError };
  }

  const payload = {
    first_name: updates.first_name ?? undefined,
    middle_name: updates.middle_name ?? undefined,
    last_name: updates.last_name ?? undefined,
    suffix: updates.suffix ?? undefined,
    birthdate: updates.birthdate ?? undefined,
    gender: updates.gender ?? undefined,
    contact_number: updates.phone ?? updates.contact_number ?? undefined,
    city: updates.city ?? undefined,
    province: updates.province ?? undefined,
    street: updates.street ?? undefined,
    barangay: updates.barangay ?? undefined,
    region: updates.region ?? undefined,
    country: updates.country ?? undefined,
    latitude: updates.latitude !== undefined && updates.latitude !== '' ? Number(updates.latitude) : undefined,
    longitude: updates.longitude !== undefined && updates.longitude !== '' ? Number(updates.longitude) : undefined,
    joined_date: updates.joined_date ?? undefined,
    photo_path: updates.avatar_url ?? updates.photo_path ?? undefined,
    updated_at: new Date().toISOString(),
  };

  const filteredPayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );

  const authContext = await ensureMutationAuthContext({
    table: 'user_details',
    operation: 'update',
    expectedAuthUserId: authUserId,
    systemUserId: systemUserResult.data.user_id,
    payload: filteredPayload,
  });

  if (authContext.error) {
    return { data: null, error: authContext.error };
  }

  logAppEvent('profile.query.update_target', 'Updating user_details via primary key.', {
    table: 'user_details',
    filter: {
      user_details_id: ensuredDetailsResult.data.user_details_id,
      user_id: systemUserResult.data.user_id,
    },
    authUserId,
    systemUserId: systemUserResult.data.user_id,
  });

  const result = await supabase
    .from('user_details')
    .update(filteredPayload)
    .eq('user_details_id', ensuredDetailsResult.data.user_details_id)
    .select()
    .maybeSingle();

  if (result.error) {
    logAppError('profile.query.update_failed', result.error, buildQueryContext({
      table: 'user_details',
      filter: {
        user_details_id: ensuredDetailsResult.data.user_details_id,
        user_id: systemUserResult.data.user_id,
      },
      authUserId,
      systemUserId: systemUserResult.data.user_id,
      currentAuthUserId: authContext.currentAuthUserId,
      payloadKeys: authContext.context.payloadKeys,
      operation: 'update',
      supabaseError: buildSupabaseErrorMeta(result.error),
    }));
    return result;
  }

  if (!result.data?.user_details_id) {
    logAppEvent('profile.query.update_no_row', 'Update returned no user_details row. Refetching by primary key.', {
      table: 'user_details',
      filter: {
        user_details_id: ensuredDetailsResult.data.user_details_id,
        user_id: systemUserResult.data.user_id,
      },
      authUserId,
      systemUserId: systemUserResult.data.user_id,
    }, 'warn');

    const refetchedDetailsResult = await fetchUserDetailsById(ensuredDetailsResult.data.user_details_id);
    if (refetchedDetailsResult.error) {
      return { data: null, error: refetchedDetailsResult.error };
    }

    return {
      data: normalizeSystemUser(systemUserResult.data, refetchedDetailsResult.data),
      error: null,
    };
  }

  return {
    data: normalizeSystemUser(systemUserResult.data, result.data),
    error: null,
  };
};

export const uploadProfileAvatar = async ({
  authUserId,
  fileBody,
  contentType,
  fileName,
}) => {
  return await uploadProfileMedia({
    authUserId,
    fileBody,
    contentType,
    fileName,
    bucket: profileAvatarStorageBucket,
    fileType: 'profile-avatar',
    folder: 'profile-avatar',
  });
};

export const uploadPatientOnboardingMedia = async ({
  authUserId,
  fileBody,
  contentType,
  fileName,
  documentType = 'patient-media',
}) => (
  await uploadProfileMedia({
    authUserId,
    fileBody,
    contentType,
    fileName,
    bucket: patientOnboardingStorageBucket,
    fileType: documentType,
    folder: documentType,
  })
);

export const fetchDonorProfileByUserId = async (userId) => {
  const profileResult = await fetchProfileById(userId);
  return {
    data: profileResult.data,
    error: profileResult.error,
  };
};

export const updateDonorProfile = async (userId, updates) => (
  await updateProfile(userId, updates)
);

export const fetchPatientDetailsByUserId = async (userIdentifier) => {
  const systemUserResult = await resolveSystemUser(userIdentifier, { ensure: false });
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const result = await runSingleRowSelect({
    table: 'patients',
    filter: { user_id: systemUserResult.data.user_id },
    authUserId: isUuid(userIdentifier) ? userIdentifier : '',
    systemUserId: systemUserResult.data.user_id,
    queryBuilder: supabase
      .from('patients')
      .select('*')
      .eq('user_id', systemUserResult.data.user_id)
      .order('updated_at', { ascending: false }),
  });

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};

export const fetchHospitalStaffByUserId = async (userIdentifier) => {
  const systemUserResult = await resolveSystemUser(userIdentifier, { ensure: false });
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const result = await runSingleRowSelect({
    table: 'hospital_staff',
    filter: { user_id: systemUserResult.data.user_id },
    authUserId: isUuid(userIdentifier) ? userIdentifier : '',
    systemUserId: systemUserResult.data.user_id,
    queryBuilder: supabase
      .from('hospital_staff')
      .select('*')
      .eq('user_id', systemUserResult.data.user_id)
      .order('assigned_date', { ascending: false }),
  });

  return {
    data: result.data ? normalizeHospitalStaff(result.data) : null,
    error: result.error,
  };
};

export const fetchHospitalRepresentativeById = async (hospitalId) => {
  if (!hospitalId) {
    return { data: null, error: null };
  }

  const result = await runSingleRowSelect({
    table: 'H-Representatives',
    filter: { hospital_id: hospitalId },
    hospitalId,
    queryBuilder: supabase
      .from('H-Representatives')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('updated_at', { ascending: false }),
  });

  return {
    data: result.data ? normalizeHospitalRepresentative(result.data) : null,
    error: result.error,
  };
};

export const fetchLatestAuditLogByAction = async ({ databaseUserId, authUserId, action, status }) => {
  if (!action) {
    return { data: null, error: new Error('Audit action is required.') };
  }

  let query = supabase
    .from('audit_logs')
    .select('log_id, user_id, action, description, time, user_email, resource, status')
    .eq('action', action)
    .order('time', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  if (databaseUserId) {
    query = query.eq('user_id', databaseUserId);
  } else if (authUserId) {
    const systemUserResult = await resolveSystemUser(authUserId, { ensure: false });
    if (systemUserResult.error || !systemUserResult.data?.user_id) {
      return { data: null, error: null };
    }

    query = query.eq('user_id', systemUserResult.data.user_id);
  } else {
    return { data: null, error: null };
  }

  const result = await query.limit(1).maybeSingle();
  return {
    data: result.data || null,
    error: result.error || null,
  };
};

export const fetchPatientDetailsByCode = async (patientCode) => {
  const normalizedCode = patientCode?.trim()?.toUpperCase();
  if (!normalizedCode) {
    return { data: null, error: new Error('Patient code is required.') };
  }

  const result = await runSingleRowSelect({
    table: 'patients',
    filter: { patient_code: normalizedCode },
    queryBuilder: supabase
      .from('patients')
      .select('*')
      .ilike('patient_code', normalizedCode)
      .order('updated_at', { ascending: false }),
  });

  if (result.error || !result.data) {
    return {
      data: null,
      error: result.error,
    };
  }

  let systemUser = null;
  let userDetails = null;
  let hospital = null;

  if (result.data.user_id) {
    const [systemUserResult, userDetailsResult] = await Promise.all([
      resolveSystemUser(result.data.user_id, { ensure: false }),
      fetchUserDetailsBySystemUserId(result.data.user_id),
    ]);

    systemUser = systemUserResult.data || null;
    userDetails = userDetailsResult.data || null;
  }

  if (result.data.hospital_id) {
    const hospitalResult = await fetchHospitalRepresentativeById(result.data.hospital_id);
    hospital = hospitalResult.data || null;
  }

  const fullName = [
    userDetails?.first_name,
    userDetails?.middle_name,
    userDetails?.last_name,
    userDetails?.suffix,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    data: normalizePatientLinkPreview({
      ...result.data,
      linked_auth_user_id: systemUser?.auth_user_id || '',
      hospital_name: hospital?.hospital_name || '',
      first_name: userDetails?.first_name || '',
      middle_name: userDetails?.middle_name || '',
      last_name: userDetails?.last_name || '',
      suffix: userDetails?.suffix || '',
      full_name: fullName,
    }),
    error: null,
  };
};

export const createPatientDetails = async (payload) => {
  const systemUserResult = await resolveSystemUser(payload?.user_id);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const patientPayload = {
    hospital_id: payload?.hospital_id || null,
    patient_picture: payload?.patient_picture || null,
    medical_condition: payload?.medical_condition || null,
    date_of_diagnosis: payload?.date_of_diagnosis || null,
    guardian: payload?.guardian || null,
    guardian_relationship: payload?.guardian_relationship || null,
    guardian_contact_number: payload?.guardian_contact_number || null,
    medical_document: payload?.medical_document || null,
  };

  const authContext = await ensureMutationAuthContext({
    table: 'patients',
    operation: 'insert',
    expectedAuthUserId: systemUserResult.data.auth_user_id || '',
    systemUserId: systemUserResult.data.user_id,
    payload: patientPayload,
  });

  if (authContext.error) {
    return { data: null, error: authContext.error };
  }

  const profileResult = await fetchProfileById(systemUserResult.data.auth_user_id);
  const profile = profileResult.data;

  const result = await supabase
    .from('patients')
    .insert([{
      user_id: systemUserResult.data.user_id,
      hospital_id: patientPayload.hospital_id,
      patient_picture: patientPayload.patient_picture || profile?.photo_path || null,
      medical_condition: patientPayload.medical_condition,
      date_of_diagnosis: patientPayload.date_of_diagnosis,
      guardian: patientPayload.guardian,
      guardian_relationship: patientPayload.guardian_relationship,
      guardian_contact_number: patientPayload.guardian_contact_number,
      medical_document: patientPayload.medical_document,
    }])
    .select()
    .maybeSingle();

  if (result.error) {
    logAppError('profile.query.insert_failed', result.error, buildQueryContext({
      table: 'patients',
      filter: { user_id: systemUserResult.data.user_id },
      authUserId: systemUserResult.data.auth_user_id || '',
      systemUserId: systemUserResult.data.user_id,
    }));
    logAppError('profile.mutation.failed', result.error, {
      ...authContext.context,
      supabaseError: buildSupabaseErrorMeta(result.error),
    });
    return {
      data: null,
      error: result.error,
    };
  }

  if (!result.data?.patient_id) {
    logAppEvent('profile.query.insert_no_row', 'Insert succeeded without a returned patients row. Refetching.', {
      table: 'patients',
      filter: { user_id: systemUserResult.data.user_id },
      authUserId: systemUserResult.data.auth_user_id || '',
      systemUserId: systemUserResult.data.user_id,
    }, 'warn');

    return await fetchPatientDetailsByUserId(systemUserResult.data.auth_user_id || systemUserResult.data.user_id);
  }

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};

export const updatePatientPictureByPatientId = async (patientId, patientPicture) => {
  const result = await supabase
    .from('patients')
    .update({
      patient_picture: patientPicture,
      updated_at: new Date().toISOString(),
    })
    .eq('patient_id', patientId)
    .select()
    .maybeSingle();

  if (result.error) {
    logAppError('profile.query.update_failed', result.error, buildQueryContext({
      table: 'patients',
      filter: { patient_id: patientId },
      patientId,
    }));
    return {
      data: null,
      error: result.error,
    };
  }

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};

export const updatePatientDetails = async (userIdentifier, updates) => {
  const systemUserResult = await resolveSystemUser(userIdentifier);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const patientResult = await fetchPatientDetailsByUserId(userIdentifier);
  if (patientResult.error) {
    return { data: null, error: patientResult.error };
  }

  if (!patientResult.data?.patient_id) {
    const createResult = await createPatientDetails({
      user_id: userIdentifier,
      ...updates,
    });
    if (createResult.error) {
      return createResult;
    }
  }

  const refreshedPatient = await fetchPatientDetailsByUserId(userIdentifier);
  if (refreshedPatient.error || !refreshedPatient.data?.patient_id) {
    return { data: null, error: refreshedPatient.error || new Error('Patient record is not available.') };
  }

  const patientPayload = {
    hospital_id: updates.hospital_id ?? undefined,
    medical_condition: updates.medical_condition ?? undefined,
    patient_picture: updates.patient_picture ?? updates.avatar_url ?? undefined,
    date_of_diagnosis: updates.date_of_diagnosis ?? undefined,
    guardian: updates.guardian ?? undefined,
    guardian_relationship: updates.guardian_relationship ?? undefined,
    guardian_contact_number: updates.guardian_contact_number ?? undefined,
    medical_document: updates.medical_document ?? undefined,
    updated_at: new Date().toISOString(),
  };

  const authContext = await ensureMutationAuthContext({
    table: 'patients',
    operation: 'update',
    expectedAuthUserId: systemUserResult.data.auth_user_id || '',
    systemUserId: systemUserResult.data.user_id,
    patientId: refreshedPatient.data.patient_id,
    payload: patientPayload,
  });

  if (authContext.error) {
    return { data: null, error: authContext.error };
  }

  const result = await supabase
    .from('patients')
    .update(patientPayload)
    .eq('patient_id', refreshedPatient.data.patient_id)
    .select()
    .maybeSingle();

  if (result.error) {
    logAppError('profile.query.update_failed', result.error, buildQueryContext({
      table: 'patients',
      filter: { patient_id: refreshedPatient.data.patient_id },
      patientId: refreshedPatient.data.patient_id,
      authUserId: isUuid(userIdentifier) ? userIdentifier : '',
      systemUserId: refreshedPatient.data.user_id || null,
      currentAuthUserId: authContext.currentAuthUserId,
      payloadKeys: authContext.context.payloadKeys,
      operation: 'update',
      supabaseError: buildSupabaseErrorMeta(result.error),
    }));
    return {
      data: null,
      error: result.error,
    };
  }

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};

export const linkPatientDetailsToUserByCode = async ({
  userIdentifier,
  patientCode,
  patientPicture,
}) => {
  const systemUserResult = await resolveSystemUser(userIdentifier);
  if (systemUserResult.error || !systemUserResult.data?.user_id) {
    return { data: null, error: systemUserResult.error || new Error('System user could not be loaded.') };
  }

  const patientResult = await fetchPatientDetailsByCode(patientCode);
  if (patientResult.error || !patientResult.data?.patient_id) {
    return { data: null, error: patientResult.error || new Error('Patient record was not found.') };
  }

  if (
    patientResult.data.linked_auth_user_id
    && patientResult.data.linked_auth_user_id !== systemUserResult.data.auth_user_id
  ) {
    return { data: null, error: new Error('This patient code is already linked to another account.') };
  }

  if (patientResult.data.user_id && patientResult.data.user_id !== systemUserResult.data.user_id) {
    const sourceDetailsResult = await fetchUserDetailsBySystemUserId(patientResult.data.user_id);

    if (sourceDetailsResult.data && systemUserResult.data.auth_user_id) {
      await updateProfile(systemUserResult.data.auth_user_id, {
        first_name: sourceDetailsResult.data.first_name || undefined,
        middle_name: sourceDetailsResult.data.middle_name || undefined,
        last_name: sourceDetailsResult.data.last_name || undefined,
        suffix: sourceDetailsResult.data.suffix || undefined,
        birthdate: sourceDetailsResult.data.birthdate || undefined,
        gender: sourceDetailsResult.data.gender || undefined,
        contact_number: sourceDetailsResult.data.contact_number || undefined,
        street: sourceDetailsResult.data.street || undefined,
        barangay: sourceDetailsResult.data.barangay || undefined,
        region: sourceDetailsResult.data.region || undefined,
        city: sourceDetailsResult.data.city || undefined,
        province: sourceDetailsResult.data.province || undefined,
        country: sourceDetailsResult.data.country || undefined,
        joined_date: sourceDetailsResult.data.joined_date || undefined,
        photo_path: sourceDetailsResult.data.photo_path || undefined,
        latitude: sourceDetailsResult.data.latitude ?? undefined,
        longitude: sourceDetailsResult.data.longitude ?? undefined,
      });
    }
  }

  const updates = {
    user_id: systemUserResult.data.user_id,
    updated_at: new Date().toISOString(),
  };

  if (patientPicture) {
    updates.patient_picture = patientPicture;
  }

  const authContext = await ensureMutationAuthContext({
    table: 'patients',
    operation: 'update',
    expectedAuthUserId: systemUserResult.data.auth_user_id || '',
    systemUserId: systemUserResult.data.user_id,
    patientId: patientResult.data.patient_id,
    payload: updates,
  });

  if (authContext.error) {
    return { data: null, error: authContext.error };
  }

  const result = await supabase
    .from('patients')
    .update(updates)
    .eq('patient_id', patientResult.data.patient_id)
    .select()
    .maybeSingle();

  if (result.error) {
    logAppError('profile.query.update_failed', result.error, buildQueryContext({
      table: 'patients',
      filter: { patient_id: patientResult.data.patient_id },
      patientId: patientResult.data.patient_id,
      authUserId: systemUserResult.data.auth_user_id || '',
      systemUserId: systemUserResult.data.user_id,
      currentAuthUserId: authContext.currentAuthUserId,
      payloadKeys: authContext.context.payloadKeys,
      operation: 'update',
      supabaseError: buildSupabaseErrorMeta(result.error),
    }));
    return {
      data: null,
      error: result.error,
    };
  }

  return {
    data: result.data ? normalizePatient(result.data) : null,
    error: result.error,
  };
};
